-- ============================================================
--  VORTEX — FIX: infinite recursion in profiles RLS policies
--  Run in Supabase SQL Editor (project bptdnmwgcnkmdeefscmh)
--  This is the real root cause: a policy on `profiles` queried
--  `profiles` again, so EVERY read failed with 42P17 recursion,
--  which made the site never see the owner role.
-- ============================================================

-- 1) Drop EVERY existing policy on profiles (clean slate — kills the recursive one)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 2) Recreate simple, NON-recursive policies.
--    The trick: never SELECT from `profiles` inside a `profiles` policy.
--    Privilege checks compare only against auth.uid() / auth.jwt().
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Each user can read their own row
CREATE POLICY "own_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Each user can update their own row
CREATE POLICY "own_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Each user can insert their own row
CREATE POLICY "own_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3) Verify: this SELECT must now return your row, NOT a recursion error
SELECT id, email, role, plan FROM public.profiles
WHERE id = 'b3567e7a-7ead-4d61-bbe4-0b9852fc7c05';
