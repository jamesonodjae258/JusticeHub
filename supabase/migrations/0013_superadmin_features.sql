-- ============================================================
-- JusticeHub — 0013_superadmin_features.sql
-- Phase 2 Chunk 6: Firm status (suspension), feature flags,
-- platform email templates, and RLS.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. FIRM STATUS COLUMN
-- ─────────────────────────────────────────────────────────────

ALTER TABLE firm ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));

-- ─────────────────────────────────────────────────────────────
-- 2. FEATURE FLAGS TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_flags (
  key             text PRIMARY KEY,
  name            text NOT NULL,
  global_enabled  boolean NOT NULL DEFAULT true,
  firm_overrides  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed default feature flags
INSERT INTO feature_flags (key, name, global_enabled) VALUES
  ('time_tracking',    'Time Tracking Module', true),
  ('billing',          'Billing & Invoicing Module', true),
  ('esignature',        'E-Signature Module', true),
  ('maintenance_mode', 'Platform Maintenance Mode', false)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. PLATFORM EMAIL TEMPLATES TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_email_templates (
  template_key text PRIMARY KEY,
  name         text NOT NULL,
  subject      text NOT NULL,
  body_html    text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed default email templates
INSERT INTO platform_email_templates (template_key, name, subject, body_html) VALUES
  ('invite',           'Team Member Invitation',   'You have been invited to join {{firm_name}} on JusticeHub', '<p>Hello {{client_name}},</p><p>You have been invited to join <strong>{{firm_name}}</strong> as a team member.</p><p><a href="{{link}}">Accept Invitation</a></p>'),
  ('portal_invite',    'Client Portal Invitation', 'Access your client portal for {{case_name}}',               '<p>Dear {{client_name}},</p><p>You can view your case <strong>{{case_name}}</strong> on the client portal.</p><p><a href="{{link}}">Access Portal</a></p>'),
  ('invoice_delivery', 'Invoice Delivery',        'Invoice from {{firm_name}}',                               '<p>Dear {{client_name}},</p><p>Please find attached your invoice for <strong>{{case_name}}</strong>.</p><p><a href="{{link}}">View Invoice</a></p>'),
  ('overdue_reminder', 'Overdue Payment Reminder', 'Reminder: Payment overdue for invoice from {{firm_name}}',     '<p>Dear {{client_name}},</p><p>This is a reminder regarding your invoice for <strong>{{case_name}}</strong>.</p><p><a href="{{link}}">Pay Invoice</a></p>'),
  ('signing_request',  'Document Signing Request', 'Signature requested for document on {{case_name}}',         '<p>Dear {{client_name}},</p><p>Please review and sign the document for <strong>{{case_name}}</strong>.</p><p><a href="{{link}}">Review Document</a></p>')
ON CONFLICT (template_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. ENABLE RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_email_templates ENABLE ROW LEVEL SECURITY;

-- Feature flags policies
CREATE POLICY "feature_flags: read all"
  ON feature_flags FOR SELECT
  USING (true);

CREATE POLICY "feature_flags: super_admin update"
  ON feature_flags FOR ALL
  USING (is_super_admin());

-- Email templates policies
CREATE POLICY "email_templates: read all"
  ON platform_email_templates FOR SELECT
  USING (true);

CREATE POLICY "email_templates: super_admin update"
  ON platform_email_templates FOR ALL
  USING (is_super_admin());
