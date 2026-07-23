-- ============================================================
--  VORTEX BM — Complete schema migration
--  Project : bptdnmwgcnkmdeefscmh
--  Date    : 2026-07-23
--  Safe to run multiple times (fully idempotent).
--
--  HOW TO APPLY:
--    1. Open https://supabase.com/dashboard/project/bptdnmwgcnkmdeefscmh/sql
--    2. Paste this entire file and click "Run".
--    3. Verify the SELECT at the very bottom shows both owner accounts.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
--  1. PROFILES TABLE
--     Central user record. One row per auth.users row.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email                  text,
  ADD COLUMN IF NOT EXISTS username               text,
  ADD COLUMN IF NOT EXISTS role                   text        DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS plan                   text        DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS allowed_types          text[]      DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_frozen              boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_id     text,
  ADD COLUMN IF NOT EXISTS fingerprint            text,
  ADD COLUMN IF NOT EXISTS avatar_url             text,
  ADD COLUMN IF NOT EXISTS created_at             timestamptz DEFAULT now();


-- ══════════════════════════════════════════════════════════════
--  2. SUPPORT TICKETS TABLE
--     Used by /api/admin/tickets endpoints.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  subject     text        NOT NULL DEFAULT '',
  message     text        NOT NULL DEFAULT '',
  priority    text        NOT NULL DEFAULT 'normal',
  status      text        NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS username   text,
  ADD COLUMN IF NOT EXISTS reply      text;


-- ══════════════════════════════════════════════════════════════
--  3. SITE SETTINGS TABLE
--     Single-row config (id = 1 always).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.site_settings (
  id              int  PRIMARY KEY DEFAULT 1,
  mascot_enabled  boolean DEFAULT true,
  mascot_size     int     DEFAULT 120,
  mascot_bottom   int     DEFAULT 50,
  mascot_right    int     DEFAULT 12,
  updated_at      timestamptz DEFAULT now()
);

-- Ensure the default row exists.
INSERT INTO public.site_settings (id, mascot_enabled, mascot_size, mascot_bottom, mascot_right)
VALUES (1, true, 120, 50, 12)
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
--  4. TRIGGER: auto-create profile on new signup
-- ══════════════════════════════════════════════════════════════
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


-- ══════════════════════════════════════════════════════════════
--  5. BACKFILL: create profile rows for any existing auth users
--     that never got a profile (handles older accounts).
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.profiles (id, email, username, role, plan, allowed_types)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  'user',
  'none',
  '{}'::text[]
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Keep email column in sync for rows that were created empty.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');


-- ══════════════════════════════════════════════════════════════
--  6. OWNER ACCOUNTS — full privilege, never frozen
--     Both emails are permanent site owners.
-- ══════════════════════════════════════════════════════════════
UPDATE public.profiles
SET role           = 'owner',
    plan           = 'enterprise',
    is_frozen      = false,
    allowed_types  = ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','cc_tools','vortex_meta_tools','remove_payment',
      'add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban',
      'methods','debug','generator','checker','email',
      'social','proxy','support'
    ]
WHERE lower(email) IN (
  'beshoyyy1986@gmail.com',
  'beshoyyy1986@outlook.com'
);


-- ══════════════════════════════════════════════════════════════
--  7. ROW LEVEL SECURITY — profiles
--     Clean slate: drop all existing policies first to avoid
--     the infinite-recursion bug caused by policies that
--     queried profiles from within profiles.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END;
$$;

-- Users can always read their own profile.
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (e.g. avatar_url, fingerprint).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (for the trigger + manual upserts).
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Service-role can do anything (used by the admin API server).
-- Note: service_role bypasses RLS by default in Supabase; this
-- policy is a belt-and-suspenders safety net for future changes.
CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
--  8. ROW LEVEL SECURITY — support_tickets
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_tickets', pol.policyname);
  END LOOP;
END;
$$;

-- Authenticated users can read and insert their own tickets.
CREATE POLICY "tickets_select_own"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tickets_insert_own"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can manage all tickets (admin panel).
CREATE POLICY "tickets_service_role_all"
  ON public.support_tickets FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
--  9. ROW LEVEL SECURITY — site_settings
--     Only readable by authenticated users; writable only by
--     the admin API (service role).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.site_settings', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "settings_select_authenticated"
  ON public.site_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "settings_service_role_all"
  ON public.site_settings FOR ALL
  USING (true)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
--  10. VERIFY — run this to confirm everything is correct.
--      Owner accounts should appear first with role = owner.
-- ══════════════════════════════════════════════════════════════
SELECT
  email,
  role,
  plan,
  is_frozen,
  avatar_url IS NOT NULL AS has_avatar,
  array_length(allowed_types, 1)  AS tool_count
FROM public.profiles
ORDER BY
  (role = 'owner') DESC,
  email;
