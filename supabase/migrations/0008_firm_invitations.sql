-- ============================================================
-- JusticeHub — 0008_firm_invitations.sql
-- Phase 2 Chunk 2: firm_invitations table for team member
-- invitations, with RLS policies.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE firm_invitations TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS firm_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL,
  invited_by  uuid NOT NULL REFERENCES user_profile(id) ON DELETE SET NULL,
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Only attorney or staff can be invited — not firm_admin or client
  CONSTRAINT firm_invitations_role_check
    CHECK (role IN ('attorney', 'staff'))
);

-- Unique token for lookup
CREATE UNIQUE INDEX IF NOT EXISTS firm_invitations_token_idx
  ON firm_invitations(token);

-- Fast lookup by firm + status
CREATE INDEX IF NOT EXISTS firm_invitations_firm_id_idx
  ON firm_invitations(firm_id, accepted_at);

-- Prevent duplicate pending invites to the same email within a firm
CREATE UNIQUE INDEX IF NOT EXISTS firm_invitations_pending_unique
  ON firm_invitations(firm_id, email)
  WHERE accepted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. ENABLE RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE firm_invitations ENABLE ROW LEVEL SECURITY;

-- Firm admin can read invitations for their firm
CREATE POLICY "firm_invitations: admin read own firm"
  ON firm_invitations FOR SELECT
  USING (firm_id = my_firm_id() AND my_role() = 'firm_admin');

-- Firm admin can create invitations for their firm
CREATE POLICY "firm_invitations: admin insert own firm"
  ON firm_invitations FOR INSERT
  WITH CHECK (firm_id = my_firm_id() AND my_role() = 'firm_admin');

-- Firm admin can update invitations (resend = new token + expires_at)
CREATE POLICY "firm_invitations: admin update own firm"
  ON firm_invitations FOR UPDATE
  USING (firm_id = my_firm_id() AND my_role() = 'firm_admin')
  WITH CHECK (firm_id = my_firm_id() AND my_role() = 'firm_admin');

-- Super admin can read all invitations (platform oversight)
CREATE POLICY "firm_invitations: super_admin read all"
  ON firm_invitations FOR SELECT
  USING (is_super_admin());
