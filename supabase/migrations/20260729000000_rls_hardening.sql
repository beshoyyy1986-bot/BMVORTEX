-- ══════════════════════════════════════════════════════════════
--  RLS HARDENING
--
--  Fixes two privilege-escalation holes left by
--  20260723000000_complete_schema.sql:
--
--  1. The "*_service_role_all" policies were created as
--     `FOR ALL USING (true) WITH CHECK (true)` with no `TO` clause.
--     A policy with no `TO` applies to PUBLIC — so every anon and
--     authenticated caller inherited full read/write/delete on
--     profiles, support_tickets and site_settings. Anyone holding
--     the (public, by design) anon key could dump every user row.
--
--  2. "profiles_update_own" allowed a user to update their own row
--     with no column restriction, so `update profiles set
--     role = 'owner' where id = auth.uid()` succeeded. That role is
--     exactly what the admin API's requireAdmin middleware trusts,
--     so this was a full path from "any signed-up user" to
--     "site owner".
-- ══════════════════════════════════════════════════════════════


-- ── 1. Scope the service-role policies to the service_role only ──
-- (service_role bypasses RLS anyway; these remain as a safety net,
--  but must never be inherited by PUBLIC.)

DROP POLICY IF EXISTS "profiles_service_role_all"  ON public.profiles;
CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_service_role_all"   ON public.support_tickets;
CREATE POLICY "tickets_service_role_all"
  ON public.support_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "settings_service_role_all"  ON public.site_settings;
CREATE POLICY "settings_service_role_all"
  ON public.site_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 2. Scope the user-facing profile policies to authenticated ───
-- Without a TO clause these also applied to the `anon` role.

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "tickets_select_own" ON public.support_tickets;
CREATE POLICY "tickets_select_own"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tickets_insert_own" ON public.support_tickets;
CREATE POLICY "tickets_insert_own"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "settings_select_authenticated" ON public.site_settings;
CREATE POLICY "settings_select_authenticated"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (true);


-- ── 3. Freeze the privilege columns against self-service edits ───
-- RLS WITH CHECK cannot compare against the OLD row, so the column
-- guard is a trigger. service_role (the admin API) is exempt —
-- triggers, unlike RLS, are NOT bypassed by the service key.
--
-- Columns intentionally left writable by the owning user, because
-- the app itself writes them: avatar_url, username, fingerprint,
-- last_seen_at, current_session_id, email.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The admin API connects with the service key; PostgREST switches
  -- the session to the service_role DB role for those requests.
  IF current_user = 'service_role'
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Anyone else: silently keep the previous values. Using assignment
  -- rather than RAISE keeps ordinary profile updates (avatar, session
  -- id, heartbeat) working instead of erroring the whole statement.
  NEW.role                    := OLD.role;
  NEW.plan                    := OLD.plan;
  NEW.allowed_types           := OLD.allowed_types;
  NEW.is_frozen               := OLD.is_frozen;
  NEW.subscription_expires_at := OLD.subscription_expires_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();


-- ── 4. Same guard on INSERT ──────────────────────────────────────
-- A user can insert their own profile row (profiles_insert_own), so
-- without this they could simply insert themselves as an owner if
-- the trigger-created row were ever missing.

CREATE OR REPLACE FUNCTION public.force_default_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'service_role'
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

DROP TRIGGER IF EXISTS force_default_profile_privileges ON public.profiles;
CREATE TRIGGER force_default_profile_privileges
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_default_profile_privileges();


-- ── 5. Re-assert owner roles ─────────────────────────────────────
-- The client no longer elevates by e-mail, so the DB must carry the
-- owner role. Keep this list here (server-side, never bundled).

UPDATE public.profiles
SET role      = 'owner',
    plan      = 'enterprise',
    is_frozen = false
WHERE lower(email) IN (
  'beshoyyy1986@gmail.com',
  'beshoyyy1986@outlook.com'
);
