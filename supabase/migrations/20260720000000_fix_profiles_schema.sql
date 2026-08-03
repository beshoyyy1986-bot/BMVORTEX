-- Fix profiles schema for the admin panel.
-- Adds columns adminRoutes.js depends on, an auto-profile trigger, and RLS policies.

-- ── Base table ────────────────────────────────────────────────────────────────
-- This migration predates 20260723000000_complete_schema.sql, which is where the
-- table was originally declared. Declaring it here too keeps the history
-- replayable from an empty database.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now()
);

-- ── Add missing columns to profiles ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS allowed_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_id text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS username text;

-- ── Auto-create a profile row when a user signs up ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, role, plan, allowed_types)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'user',
    'none',
    '{}'::text[]
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- NOTE: Postgres does NOT support `CREATE POLICY IF NOT EXISTS`, so we
-- DROP-then-CREATE to stay idempotent.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role has full access" ON public.profiles;
CREATE POLICY "Service role has full access"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);
