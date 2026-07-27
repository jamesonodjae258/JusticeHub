-- ============================================================
-- JusticeHub — 0010_avatars_storage_bucket.sql
-- Creates private 'avatars' storage bucket and storage RLS.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false, -- PRIVATE BUCKET — signed URLs required per PRD §4.1
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ─────────────────────────────────────────────────────────────
-- STORAGE RLS POLICIES FOR 'avatars' BUCKET
-- ─────────────────────────────────────────────────────────────

-- Authenticated users can upload avatar objects into their own user_id directory
CREATE POLICY "avatars: user insert own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own avatar object
CREATE POLICY "avatars: user update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own avatar object
CREATE POLICY "avatars: user delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users (firm members and portal clients) can read avatars from the bucket
CREATE POLICY "avatars: authenticated read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');
