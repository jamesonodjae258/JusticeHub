-- ============================================================
-- JusticeHub — 0007_phase2_role_system.sql
-- Phase 2 Chunk 1: Extends role system to 5 roles, adds
-- super_admin_audit_log (immutable), case_document_access,
-- JWT custom claims hook, and rewrites ALL RLS policies.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. EXTEND user_profile.role TO SUPPORT 5 ROLES
-- ─────────────────────────────────────────────────────────────

-- Drop the old Phase 1 constraint (only allowed firm_admin, staff, client)
ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_role_check;

-- Migrate existing Phase 1 'staff' users → Phase 2 'attorney'
-- Phase 1 "staff" had full case/doc access — that maps to Attorney in Phase 2.
UPDATE user_profile SET role = 'attorney' WHERE role = 'staff';

-- Add the new constraint supporting all 5 roles
ALTER TABLE user_profile ADD CONSTRAINT user_profile_role_check
  CHECK (role IN ('super_admin', 'firm_admin', 'attorney', 'staff', 'client'));

-- ─────────────────────────────────────────────────────────────
-- 2. ADD STATUS + DEACTIVATION FIELDS TO user_profile
-- ─────────────────────────────────────────────────────────────

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profile_status_check'
  ) THEN
    ALTER TABLE user_profile ADD CONSTRAINT user_profile_status_check
      CHECK (status IN ('active', 'deactivated'));
  END IF;
END $$;

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for filtering active users
CREATE INDEX IF NOT EXISTS user_profile_status_idx ON user_profile(firm_id, status);

-- ─────────────────────────────────────────────────────────────
-- 3. CREATE super_admin_audit_log TABLE (IMMUTABLE)
-- PRD §3.3 — no UPDATE or DELETE ever permitted, enforced at DB level.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       uuid,
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sa_audit_log_admin_idx   ON super_admin_audit_log(super_admin_id);
CREATE INDEX IF NOT EXISTS sa_audit_log_created_idx ON super_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS sa_audit_log_target_idx  ON super_admin_audit_log(target_type, target_id);

-- IMMUTABILITY — defense-in-depth via trigger (REVOKE alone isn't sufficient
-- because the table owner and superuser can always bypass REVOKE).
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'super_admin_audit_log is immutable — UPDATE and DELETE are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS super_admin_audit_log_no_update ON super_admin_audit_log;
CREATE TRIGGER super_admin_audit_log_no_update
  BEFORE UPDATE ON super_admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS super_admin_audit_log_no_delete ON super_admin_audit_log;
CREATE TRIGGER super_admin_audit_log_no_delete
  BEFORE DELETE ON super_admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- RLS on super_admin_audit_log
ALTER TABLE super_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. CREATE case_document_access JUNCTION TABLE
-- PRD §2.1 — Staff can only view document contents on cases
-- explicitly granted by an Attorney.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_document_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES "case"(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  granted_by  uuid NOT NULL REFERENCES user_profile(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_doc_access_unique UNIQUE (case_id, user_id)
);

CREATE INDEX IF NOT EXISTS case_doc_access_user_idx ON case_document_access(user_id, firm_id);
CREATE INDEX IF NOT EXISTS case_doc_access_case_idx ON case_document_access(case_id);

ALTER TABLE case_document_access ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 5. JWT CUSTOM CLAIMS HOOK
-- Injects user_role and user_firm_id into the access token.
-- Must be enabled in Supabase Dashboard → Auth → Hooks.
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

  -- Look up role, firm_id, and status from user_profile
  SELECT role, firm_id, status
  INTO v_user_role, v_user_firm_id, v_user_status
  FROM public.user_profile
  WHERE id = (event->>'user_id')::uuid;

  IF v_user_role IS NOT NULL THEN
    -- Block deactivated users at the JWT level
    IF v_user_status = 'deactivated' THEN
      RAISE EXCEPTION 'User account is deactivated';
    END IF;

    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_user_role));
    claims := jsonb_set(claims, '{user_firm_id}', to_jsonb(v_user_firm_id));
  ELSE
    -- Fallback for client-portal users who have a client row but no user_profile
    -- They get role='client' and their firm_id from the client table
    SELECT firm_id
    INTO v_user_firm_id
    FROM public.client
    WHERE auth_user_id = (event->>'user_id')::uuid
    LIMIT 1;

    claims := jsonb_set(claims, '{user_role}', '"client"'::jsonb);
    IF v_user_firm_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{user_firm_id}', to_jsonb(v_user_firm_id));
    END IF;
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant execute to supabase_auth_admin (required for Auth Hooks)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from everyone else — this function should only be called by Supabase Auth
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, PUBLIC;

-- The hook needs to read user_profile and client tables
GRANT SELECT ON public.user_profile TO supabase_auth_admin;
GRANT SELECT ON public.client TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────
-- 6. UPDATE RLS HELPER FUNCTIONS
-- Read from JWT claims instead of querying user_profile on every request.
-- ─────────────────────────────────────────────────────────────

-- my_role(): Returns the user's role from the JWT
CREATE OR REPLACE FUNCTION my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    auth.jwt()->>'user_role',
    'client'
  )
$$;

-- my_firm_id(): Returns the user's firm_id from the JWT, with client fallback
CREATE OR REPLACE FUNCTION my_firm_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt()->>'user_firm_id')::uuid,
    (SELECT firm_id FROM client WHERE auth_user_id = auth.uid() LIMIT 1)
  )
$$;

-- is_firm_admin(): Reads from JWT
CREATE OR REPLACE FUNCTION is_firm_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(auth.jwt()->>'user_role', '') = 'firm_admin'
$$;

-- is_super_admin(): New helper for Phase 2
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(auth.jwt()->>'user_role', '') = 'super_admin'
$$;

-- my_client_id(): Unchanged — still queries client table (no JWT equivalent)
CREATE OR REPLACE FUNCTION my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM client WHERE auth_user_id = auth.uid()
$$;


-- ═════════════════════════════════════════════════════════════
-- 7. DROP ALL EXISTING RLS POLICIES AND RECREATE
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 7a. FIRM
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "firm: staff read own firm"       ON firm;
DROP POLICY IF EXISTS "firm: admin update own firm"     ON firm;

-- All firm-level users can read their own firm
CREATE POLICY "firm: member read own"
  ON firm FOR SELECT
  USING (id = my_firm_id());

-- Firm admin can update their own firm details
CREATE POLICY "firm: admin update own"
  ON firm FOR UPDATE
  USING (id = my_firm_id() AND is_firm_admin())
  WITH CHECK (id = my_firm_id() AND is_firm_admin());

-- Super admin can read all firms (platform dashboard)
CREATE POLICY "firm: super_admin read all"
  ON firm FOR SELECT
  USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 7b. USER_PROFILE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_profile: staff read same-firm"  ON user_profile;
DROP POLICY IF EXISTS "user_profile: self update"           ON user_profile;
DROP POLICY IF EXISTS "user_profile: admin full access"     ON user_profile;

-- All firm members can read profiles within their firm
CREATE POLICY "user_profile: firm member read same-firm"
  ON user_profile FOR SELECT
  USING (firm_id = my_firm_id());

-- Any user can update their own profile (display name, etc. — NOT role)
CREATE POLICY "user_profile: self update"
  ON user_profile FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Firm admin has full CRUD on profiles within their firm
CREATE POLICY "user_profile: firm_admin manage"
  ON user_profile FOR ALL
  USING (firm_id = my_firm_id() AND is_firm_admin())
  WITH CHECK (firm_id = my_firm_id() AND is_firm_admin());

-- Super admin can read all profiles (platform management)
CREATE POLICY "user_profile: super_admin read all"
  ON user_profile FOR SELECT
  USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 7c. CLIENT
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client: staff read same-firm"    ON client;
DROP POLICY IF EXISTS "client: staff insert"            ON client;
DROP POLICY IF EXISTS "client: staff update"            ON client;
DROP POLICY IF EXISTS "client: admin delete"            ON client;
DROP POLICY IF EXISTS "client: self read"               ON client;

-- Firm members (admin, attorney, staff) can read all clients in their firm
CREATE POLICY "client: firm member read"
  ON client FOR SELECT
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  );

-- Firm admin + attorney can create clients
CREATE POLICY "client: admin+attorney insert"
  ON client FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney')
  );

-- Firm admin + attorney can update clients in their firm
CREATE POLICY "client: admin+attorney update"
  ON client FOR UPDATE
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney')
  )
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney')
  );

-- Only admin can delete clients
CREATE POLICY "client: admin delete"
  ON client FOR DELETE
  USING (firm_id = my_firm_id() AND is_firm_admin());

-- Client can read their own record
CREATE POLICY "client: self read"
  ON client FOR SELECT
  USING (auth_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 7d. CASE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "case: staff full access"   ON "case";
DROP POLICY IF EXISTS "case: client read own"     ON "case";

-- All firm members can read all cases in their firm (visibility)
CREATE POLICY "case: firm member read"
  ON "case" FOR SELECT
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  );

-- Firm admin can do everything with cases in their firm
CREATE POLICY "case: firm_admin full"
  ON "case" FOR ALL
  USING (firm_id = my_firm_id() AND is_firm_admin())
  WITH CHECK (firm_id = my_firm_id() AND is_firm_admin());

-- Attorney can create cases in their firm
CREATE POLICY "case: attorney create"
  ON "case" FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() = 'attorney'
  );

-- Attorney can update only cases assigned to them
CREATE POLICY "case: attorney update assigned"
  ON "case" FOR UPDATE
  USING (
    firm_id = my_firm_id()
    AND my_role() = 'attorney'
    AND assigned_user_id = auth.uid()
  )
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() = 'attorney'
  );

-- Client can read their own cases
CREATE POLICY "case: client read own"
  ON "case" FOR SELECT
  USING (client_id = my_client_id());

-- ─────────────────────────────────────────────────────────────
-- 7e. DOCUMENT (metadata rows — not file content)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "document: staff full access"     ON document;
DROP POLICY IF EXISTS "document: client read visible"   ON document;

-- Attorney has full access to documents in their firm
CREATE POLICY "document: attorney full access"
  ON document FOR ALL
  USING (firm_id = my_firm_id() AND my_role() = 'attorney')
  WITH CHECK (firm_id = my_firm_id() AND my_role() = 'attorney');

-- Firm admin can see document metadata (filename, tag, dates) but NOT content
-- Content restriction enforced at storage RLS + server action layer
CREATE POLICY "document: firm_admin metadata read"
  ON document FOR SELECT
  USING (firm_id = my_firm_id() AND is_firm_admin());

-- Staff can see document metadata
CREATE POLICY "document: staff metadata read"
  ON document FOR SELECT
  USING (firm_id = my_firm_id() AND my_role() = 'staff');

-- Staff can upload documents (insert metadata rows)
CREATE POLICY "document: staff upload"
  ON document FOR INSERT
  WITH CHECK (firm_id = my_firm_id() AND my_role() = 'staff');

-- Client can read only documents explicitly shared with them
CREATE POLICY "document: client read visible"
  ON document FOR SELECT
  USING (
    visible_to_client = true
    AND case_id IN (
      SELECT id FROM "case" WHERE client_id = my_client_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7f. CASE_EVENT
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "case_event: staff full access"       ON case_event;
DROP POLICY IF EXISTS "case_event: client read visible"     ON case_event;

-- Firm admin, attorney, staff can fully manage events
CREATE POLICY "case_event: firm member full access"
  ON case_event FOR ALL
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  )
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  );

-- Client can read visible events on their cases
CREATE POLICY "case_event: client read visible"
  ON case_event FOR SELECT
  USING (
    visible_to_client = true
    AND case_id IN (
      SELECT id FROM "case" WHERE client_id = my_client_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7g. NOTE (internal only — no client access)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "note: staff full access" ON note;

-- Firm admin, attorney, staff can fully manage notes
CREATE POLICY "note: firm member full access"
  ON note FOR ALL
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  )
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  );

-- ─────────────────────────────────────────────────────────────
-- 7h. AUDIT_LOG
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log: staff read own-firm" ON audit_log;

-- Firm admin, attorney, staff can read audit log for their firm
CREATE POLICY "audit_log: firm member read"
  ON audit_log FOR SELECT
  USING (
    firm_id = my_firm_id()
    AND my_role() IN ('firm_admin', 'attorney', 'staff')
  );

-- ─────────────────────────────────────────────────────────────
-- 7i. SUPER_ADMIN_AUDIT_LOG — RLS policies
-- ─────────────────────────────────────────────────────────────

-- Super admin can read their own audit trail
CREATE POLICY "sa_audit_log: super_admin read"
  ON super_admin_audit_log FOR SELECT
  USING (is_super_admin());

-- INSERT is handled server-side via service role only.
-- No UPDATE or DELETE policies — immutability enforced by triggers above.

-- ─────────────────────────────────────────────────────────────
-- 7j. CASE_DOCUMENT_ACCESS — RLS policies
-- ─────────────────────────────────────────────────────────────

-- All firm members can see access grants within their firm
CREATE POLICY "case_doc_access: firm read"
  ON case_document_access FOR SELECT
  USING (firm_id = my_firm_id());

-- Attorneys can grant document access to staff (INSERT)
CREATE POLICY "case_doc_access: attorney grant"
  ON case_document_access FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id()
    AND my_role() = 'attorney'
  );

-- Attorneys can revoke document access (DELETE)
CREATE POLICY "case_doc_access: attorney revoke"
  ON case_document_access FOR DELETE
  USING (
    firm_id = my_firm_id()
    AND my_role() = 'attorney'
  );


-- ═════════════════════════════════════════════════════════════
-- 8. UPDATE STORAGE RLS POLICIES
-- ═════════════════════════════════════════════════════════════

-- Drop all existing storage policies
DROP POLICY IF EXISTS "Staff can upload case documents"      ON storage.objects;
DROP POLICY IF EXISTS "Staff can view case documents"        ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete case documents"      ON storage.objects;
DROP POLICY IF EXISTS "Clients can download shared documents" ON storage.objects;

-- 8a. Attorney can upload documents
CREATE POLICY "Attorney can upload case documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE id = auth.uid()
        AND role = 'attorney'
        AND status = 'active'
    )
  );

-- 8b. Staff can upload documents
CREATE POLICY "Staff can upload case documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE id = auth.uid()
        AND role = 'staff'
        AND status = 'active'
    )
  );

-- 8c. Attorney can view/download all documents in their firm
CREATE POLICY "Attorney can view case documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE id = auth.uid()
        AND role = 'attorney'
        AND status = 'active'
    )
  );

-- 8d. Staff can view/download documents ONLY on cases they've been granted access to
CREATE POLICY "Staff can view granted case documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile up
      WHERE up.id = auth.uid()
        AND up.role = 'staff'
        AND up.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.document d
      JOIN public.case_document_access cda ON cda.case_id = d.case_id AND cda.user_id = auth.uid()
      WHERE d.storage_path = name
    )
  );

-- 8e. Attorney can delete documents
CREATE POLICY "Attorney can delete case documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE id = auth.uid()
        AND role = 'attorney'
        AND status = 'active'
    )
  );

-- 8f. Clients can download only shared documents (same logic as Phase 1)
CREATE POLICY "Clients can download shared documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND EXISTS (
      SELECT 1
      FROM public.document d
      JOIN public."case" ca ON ca.id = d.case_id
      JOIN public.client cl ON cl.id = ca.client_id
      WHERE d.storage_path = name
        AND d.visible_to_client = true
        AND cl.auth_user_id = auth.uid()
    )
  );

-- NOTE: Firm Admin is DELIBERATELY EXCLUDED from all storage policies.
-- They can see document metadata (via the document table) but never
-- receive a signed URL for the actual file content. This is enforced
-- at both the storage RLS level (here) and the application layer
-- (getSignedDownloadUrl server action).
