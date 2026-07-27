-- ============================================================
-- JusticeHub — 0015_phase2_architecture_v3.sql
-- Phase 2 Chunk 1 (PRD v3.0): Status tracking, JWT claims hook,
-- RLS policies, and storage signed-URL restrictions.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. USER PROFILE STATUS & DEACTIVATION TRACKING
-- ─────────────────────────────────────────────────────────────

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid NULL REFERENCES auth.users(id);

-- ─────────────────────────────────────────────────────────────
-- 2. JWT CUSTOM CLAIMS HOOK
-- Injects user_role, user_firm_id, and user_status into access token claims
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  claims jsonb;
  v_user_role text;
  v_user_firm_id uuid;
  v_user_status text;
BEGIN
  claims := event->'claims';

  SELECT role, firm_id, status
  INTO v_user_role, v_user_firm_id, v_user_status
  FROM public.user_profile
  WHERE id = (event->>'user_id')::uuid;

  IF v_user_role IS NOT NULL THEN
    IF v_user_status = 'deactivated' THEN
      RAISE EXCEPTION 'User account is deactivated';
    END IF;

    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_user_role));
    claims := jsonb_set(claims, '{user_firm_id}', to_jsonb(v_user_firm_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Helper functions
CREATE OR REPLACE FUNCTION my_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role'),
    (SELECT role FROM public.user_profile WHERE id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION my_firm_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_firm_id')::uuid,
    (SELECT firm_id FROM public.user_profile WHERE id = auth.uid())
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. STORAGE POLICIES — DOCUMENT BINARY ACCESS RESTRICTIONS
-- firm_admin can see document metadata, but CANNOT read/download document content
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_delete" ON storage.objects;

-- Storage Read Policy: DENY firm_admin, allow attorneys assigned to case and staff with case_document_access
CREATE POLICY "documents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    my_role() <> 'firm_admin' AND (
      is_super_admin() OR
      my_role() = 'attorney' OR
      EXISTS (
        SELECT 1 FROM case_document_access cda
        WHERE cda.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    my_role() IN ('attorney', 'firm_admin')
  );

CREATE POLICY "documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    my_role() IN ('attorney', 'firm_admin')
  );

-- ─────────────────────────────────────────────────────────────
-- 4. LOGIN AUDIT — SUPER_ADMIN ONLY
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address  text NOT NULL,
  user_agent  text NULL,
  logged_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_audit_super_admin_select" ON login_audit;
CREATE POLICY "login_audit_super_admin_select"
  ON login_audit FOR SELECT
  USING (is_super_admin());
