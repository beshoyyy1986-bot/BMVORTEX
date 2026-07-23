-- ============================================================
--  VORTEX — Full auth/profiles repair (run in Supabase SQL Editor)
--  Project: bptdnmwgcnkmdeefscmh
--  Safe to run multiple times (idempotent).
-- ============================================================

-- 1) Make sure the profiles table exists with every column the app needs
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS allowed_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_id text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2) Trigger: auto-create a profile row on every new signup
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

-- 3) BACKFILL: create profile rows for any existing users who have none
--    (this is why the owner had no admin panel — no profile row existed)
INSERT INTO public.profiles (id, email, username, role, plan, allowed_types)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
       'user',
       'none',
       '{}'::text[]
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 4) Keep profiles.email in sync for existing rows (some were empty)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- 5) Make the OWNER an actual owner with full access
UPDATE public.profiles
SET role = 'owner',
    plan = 'enterprise'
WHERE lower(email) = 'beshoyyy1986@gmail.com';

-- 6) Row Level Security policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 7) Verify — should show your users, and the owner as role=owner
SELECT email, role, plan, avatar_url IS NOT NULL AS has_avatar
FROM public.profiles
ORDER BY (role = 'owner') DESC, email;
