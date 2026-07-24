-- ============================================================
--  VORTEX BM — Avatar storage bucket + RLS policies
--  Allows users to upload/update their own avatar directly
--  from the client-side Supabase client.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
--  0. SEED site_settings (mascot defaults)
--     Ensures mascot shows by default before any admin touches
--     the settings panel.
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.site_settings (id, mascot_enabled, mascot_size, mascot_bottom, mascot_right)
VALUES (1, true, 120, 50, 12)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
--  1. CREATE avatars BUCKET (idempotent)
-- ══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ══════════════════════════════════════════════════════════════
--  2. STORAGE RLS POLICIES
-- ══════════════════════════════════════════════════════════════

-- 2a. Anyone can read avatars (public bucket)
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- 2b. Authenticated users can upload avatars to their own folder
DROP POLICY IF EXISTS "Avatar user upload" ON storage.objects;
CREATE POLICY "Avatar user upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2c. Authenticated users can update their own avatars
DROP POLICY IF EXISTS "Avatar user update" ON storage.objects;
CREATE POLICY "Avatar user update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2d. Authenticated users can delete their own avatars
DROP POLICY IF EXISTS "Avatar user delete" ON storage.objects;
CREATE POLICY "Avatar user delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
