-- ============================================================
-- JusticeHub — 0017_user_management_v3.sql
-- Phase 2 Chunk 4 (PRD v3.0): Extend firm_invitations table,
-- allow super_admin to invite firm_admin, role-scoped RLS.
-- ============================================================

-- 1. Relax role check on firm_invitations to allow firm_admin invites
ALTER TABLE firm_invitations DROP CONSTRAINT IF EXISTS firm_invitations_role_check;

ALTER TABLE firm_invitations ADD CONSTRAINT firm_invitations_role_check
  CHECK (role IN ('firm_admin', 'attorney', 'staff'));

-- 2. Update RLS Policies on firm_invitations
DROP POLICY IF EXISTS "firm_invitations: admin read own firm" ON firm_invitations;
DROP POLICY IF EXISTS "firm_invitations: admin insert own firm" ON firm_invitations;
DROP POLICY IF EXISTS "firm_invitations: admin update own firm" ON firm_invitations;
DROP POLICY IF EXISTS "firm_invitations: super_admin read all" ON firm_invitations;

-- Read: super_admin or firm_admin can read firm invitations
CREATE POLICY "firm_invitations: read own firm"
  ON firm_invitations FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin')
  );

-- Insert: super_admin can invite firm_admin, attorney, staff; firm_admin can invite attorney, staff ONLY
CREATE POLICY "firm_invitations: role scoped insert"
  ON firm_invitations FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id() AND (
      my_role() = 'super_admin' OR
      (my_role() = 'firm_admin' AND role IN ('attorney', 'staff'))
    )
  );

-- Update: super_admin or firm_admin can update invitations
CREATE POLICY "firm_invitations: update own firm"
  ON firm_invitations FOR UPDATE
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin')
  );

-- Delete: super_admin or firm_admin can delete invitations
CREATE POLICY "firm_invitations: delete own firm"
  ON firm_invitations FOR DELETE
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin')
  );
