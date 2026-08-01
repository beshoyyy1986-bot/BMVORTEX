-- ══════════════════════════════════════════════════════════════
--  ADD last_seen_at TO profiles
--
--  SecureDashboardApp's heartbeat already writes this column on
--  every poll, and AdminPanel already reads it — but the column
--  was never created. PostgREST rejects the update, so the write
--  fails silently and the admin panel never shows a last-seen
--  time for anyone.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Admin panel sorts and filters on this; the table is small but
-- the index keeps "who is online right now" cheap as it grows.
CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
  ON public.profiles (last_seen_at DESC NULLS LAST);

-- last_seen_at is written by the owning user's own heartbeat, so it
-- must stay outside the privileged-column guard installed by
-- 20260729000000_rls_hardening.sql. That trigger only freezes
-- role / plan / allowed_types / is_frozen / subscription_expires_at,
-- so no change is needed there — this comment records the intent.
