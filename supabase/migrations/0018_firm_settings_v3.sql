-- ============================================================
-- JusticeHub — 0018_firm_settings_v3.sql
-- Phase 2 Chunk 6 (PRD v3.0): Extended firm_settings table,
-- columns, default values, and RLS policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS firm_settings (
  firm_id                  uuid PRIMARY KEY REFERENCES firm(id) ON DELETE CASCADE,
  address                  text NULL,
  contact_email            text NULL,
  phone                    text NULL,
  website                  text NULL,
  logo_url                 text NULL,
  invoice_currency         text NOT NULL DEFAULT 'NGN',
  invoice_number_format    text NOT NULL DEFAULT 'INV-2026-001',
  tax_label                text NULL DEFAULT 'VAT 7.5%',
  tax_rate                 numeric(5,2) NOT NULL DEFAULT 7.50,
  payment_terms            text NULL DEFAULT 'Payment due within 14 days',
  bank_details             text NULL,
  portal_message           text NULL CHECK (char_length(portal_message) <= 200),
  allow_client_download    boolean NOT NULL DEFAULT true,
  show_attorney_phone      boolean NOT NULL DEFAULT false,
  enforce_2fa              boolean NOT NULL DEFAULT false,
  session_timeout_minutes  integer NOT NULL DEFAULT 240,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE firm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm_settings: read own firm" ON firm_settings;
CREATE POLICY "firm_settings: read own firm"
  ON firm_settings FOR SELECT
  USING (firm_id = my_firm_id());

DROP POLICY IF EXISTS "firm_settings: update own firm" ON firm_settings;
CREATE POLICY "firm_settings: update own firm"
  ON firm_settings FOR UPDATE
  USING (firm_id = my_firm_id() AND is_admin_or_super());

DROP POLICY IF EXISTS "firm_settings: insert own firm" ON firm_settings;
CREATE POLICY "firm_settings: insert own firm"
  ON firm_settings FOR INSERT
  WITH CHECK (firm_id = my_firm_id() AND is_admin_or_super());
