-- ══════════════════════════════════════════════════════════════
--  Owner bootstrap, realtime, FK integrity and policy fixes
--
--  Everything needed to stand this schema up on a fresh project.
-- ══════════════════════════════════════════════════════════════


-- ── 1. Let direct DB connections through the privilege guard ─────
-- 20260729000000_rls_hardening.sql installs BEFORE INSERT/UPDATE
-- triggers that reset role/plan/allowed_types unless the caller is
-- service_role. Migrations and the SQL editor connect as `postgres`
-- / `supabase_admin`, so its own step-5 "promote the owners" UPDATE
-- was silently reverted to role = 'user' — the site came up with no
-- owner at all. Those roles are superuser-level (they can drop the
-- trigger outright), so exempting them concedes nothing; PostgREST
-- callers still arrive as `anon` / `authenticated` and stay guarded.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.role                    := OLD.role;
  NEW.plan                    := OLD.plan;
  NEW.allowed_types           := OLD.allowed_types;
  NEW.is_frozen               := OLD.is_frozen;
  NEW.subscription_expires_at := OLD.subscription_expires_at;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_default_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.role                    := 'user';
  NEW.plan                    := 'none';
  NEW.allowed_types           := '{}'::text[];
  NEW.is_frozen               := false;
  NEW.subscription_expires_at := NULL;

  RETURN NEW;
END;
$$;


-- ── 2. Promote the owners for real ───────────────────────────────
-- Re-run of 20260729000000 step 5, now that the guard lets it land.
-- allowed_types is granted explicitly: the enterprise plan is only a
-- default applied at grant time, not something the API recomputes.

UPDATE public.profiles
SET role          = 'owner',
    plan          = 'enterprise',
    is_frozen     = false,
    allowed_types = ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','inviter_user_bm','cc_tools','vortex_meta_tools',
      'remove_payment','add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban','methods',
      'debug','generator','checker','email','social','proxy','support'
    ]
WHERE lower(email) IN (
  'beshoyyy1986@gmail.com',
  'beshoyyy1986@outlook.com'
);

-- Owner promotion is keyed on email, but a brand-new project has no
-- rows yet — the owners sign up later. Re-apply on signup so the
-- first login already carries the role.
CREATE OR REPLACE FUNCTION public.promote_owner_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) IN (
    'beshoyyy1986@gmail.com',
    'beshoyyy1986@outlook.com'
  ) THEN
    NEW.role          := 'owner';
    NEW.plan          := 'enterprise';
    NEW.is_frozen     := false;
    NEW.allowed_types := ARRAY[
      'bm_meta_tool','meta_ads_one_way','mini_meta_2','cc_from_bm',
      'bm_creator','inviter_user_bm','cc_tools','vortex_meta_tools',
      'remove_payment','add_funds_meta','add_primary_cc','switch_bm_old',
      'funds','ads','cards','paypal','gateway','iban','methods',
      'debug','generator','checker','email','social','proxy','support'
    ];
  END IF;
  RETURN NEW;
END;
$$;

-- Must fire after force_default_profile_privileges, which blanks the
-- privilege columns on every non-service_role insert. Trigger order is
-- alphabetical by name, and 'zz_' sorts last.
DROP TRIGGER IF EXISTS zz_promote_owner_on_signup ON public.profiles;
CREATE TRIGGER zz_promote_owner_on_signup
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.promote_owner_on_signup();


-- ── 3. Realtime on profiles ──────────────────────────────────────
-- SecureDashboardApp subscribes to postgres_changes UPDATE on
-- public.profiles (filter id=eq.<uid>) to react to a freeze or a
-- session takeover. Without publication membership the events never
-- arrive and the session lock never engages on the victim's tab.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END;
$$;


-- ── 4. Cascade profile deletion from auth.users ──────────────────
-- The admin panel deletes accounts through auth.admin.deleteUser and
-- relies on the cascade to clear the profile row. A profiles table
-- that predates the migrations (as on this project) may not carry it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- support_tickets.user_id is nullable on purpose: a closed ticket
-- should survive the account that filed it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.support_tickets'::regclass
      AND contype  = 'f'
  ) THEN
    ALTER TABLE public.support_tickets
      ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;


-- ── 5. site_settings must be readable signed-out ─────────────────
-- Mascot.jsx renders on the public landing page and fetches this row
-- with the anon key before anyone logs in. 20260723000000 dropped the
-- original `using (true)` policy and 20260729000000 re-scoped the
-- replacement to `authenticated`, so signed-out visitors got zero rows
-- and the mascot silently never appeared. The row is four UI numbers —
-- public by design. Writes still go through the service role only.

DROP POLICY IF EXISTS "settings_select_authenticated" ON public.site_settings;
DROP POLICY IF EXISTS "settings_select_public"        ON public.site_settings;
CREATE POLICY "settings_select_public"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);


-- ── 6. support_tickets.email ─────────────────────────────────────
-- SecureDashboardApp inserts `email`; AdminPanel reads `email`. The
-- 20260723000000 rewrite of this table declared `user_email` instead,
-- so on a fresh database every ticket submission fails on an unknown
-- column. Add the column the code actually uses.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.support_tickets
SET email = user_email
WHERE email IS NULL AND user_email IS NOT NULL;


-- ── 7. Ticket ordering index ─────────────────────────────────────
-- /api/admin/tickets sorts by created_at desc on every page load.
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx
  ON public.support_tickets (created_at DESC);
