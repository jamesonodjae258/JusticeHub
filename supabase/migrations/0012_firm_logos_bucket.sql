-- ============================================================
-- JusticeHub — 0012_firm_logos_bucket.sql
-- Creates private 'firm-logos' storage bucket and storage RLS.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firm-logos',
  'firm-logos',
  false, -- PRIVATE BUCKET — signed URLs required
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

-- ─────────────────────────────────────────────────────────────
-- STORAGE RLS POLICIES FOR 'firm-logos' BUCKET
-- ─────────────────────────────────────────────────────────────

-- Firm admins can upload logo objects under their firm_id directory
CREATE POLICY "firm-logos: admin insert logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firm-logos' AND
    is_firm_admin() AND
    (storage.foldername(name))[1] = my_firm_id()::text
  );

-- Firm admins can update their firm logo object
CREATE POLICY "firm-logos: admin update logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'firm-logos' AND
    is_firm_admin() AND
    (storage.foldername(name))[1] = my_firm_id()::text
  );

-- Firm admins can delete their firm logo object
CREATE POLICY "firm-logos: admin delete logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'firm-logos' AND
    is_firm_admin() AND
    (storage.foldername(name))[1] = my_firm_id()::text
  );

-- Authenticated users (firm members and portal clients) can read firm logos
CREATE POLICY "firm-logos: authenticated read logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'firm-logos');
