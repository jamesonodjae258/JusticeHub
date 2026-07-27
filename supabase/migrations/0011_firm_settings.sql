-- ============================================================
-- JusticeHub — 0011_firm_settings.sql
-- Phase 2 Chunk 4: Firm Settings schema, auto-creation trigger,
-- backfill, and RLS policies.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE firm_settings TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS firm_settings (
  firm_id                        uuid PRIMARY KEY REFERENCES firm(id) ON DELETE CASCADE,
  -- Firm Profile
  address                        text,
  primary_email                  text,
  phone                          text,
  website_url                    text,
  logo_url                       text,
  -- Billing Defaults
  default_hourly_rate            numeric(10,2) NOT NULL DEFAULT 0.00,
  default_payment_terms          text NOT NULL DEFAULT 'Payment due within 14 days',
  invoice_currency               text NOT NULL DEFAULT 'NGN',
  invoice_prefix                 text NOT NULL DEFAULT 'INV-2026-',
  next_invoice_number            integer NOT NULL DEFAULT 1,
  tax_label                      text DEFAULT 'VAT 7.5%',
  tax_rate                       numeric(5,2) DEFAULT 7.50,
  bank_details                   text,
  -- Client Portal Settings
  portal_header_message          text CHECK (char_length(portal_header_message) <= 200),
  allow_client_doc_download     boolean NOT NULL DEFAULT false,
  show_attorney_phone_by_default boolean NOT NULL DEFAULT false,
  -- Security
  enforce_2fa                    boolean NOT NULL DEFAULT false,
  session_timeout                text NOT NULL DEFAULT '24h',
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. ENABLE RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE firm_settings ENABLE ROW LEVEL SECURITY;

-- Firm members can read settings for their firm
CREATE POLICY "firm_settings: member read own firm"
  ON firm_settings FOR SELECT
  USING (firm_id = my_firm_id());

-- Firm admin can update settings for their firm
CREATE POLICY "firm_settings: admin update own firm"
  ON firm_settings FOR UPDATE
  USING (firm_id = my_firm_id() AND is_firm_admin())
  WITH CHECK (firm_id = my_firm_id() AND is_firm_admin());

-- Firm admin can insert settings for their firm
CREATE POLICY "firm_settings: admin insert own firm"
  ON firm_settings FOR INSERT
  WITH CHECK (firm_id = my_firm_id() AND is_firm_admin());

-- Super admin can read all firm settings
CREATE POLICY "firm_settings: super_admin read all"
  ON firm_settings FOR SELECT
  USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. AUTO-CREATION TRIGGER
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_create_firm_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO firm_settings (firm_id)
  VALUES (NEW.id)
  ON CONFLICT (firm_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_auto_create_settings ON firm;
CREATE TRIGGER firm_auto_create_settings
  AFTER INSERT ON firm
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_firm_settings();

-- ─────────────────────────────────────────────────────────────
-- 4. BACKFILL EXISTING FIRMS
-- ─────────────────────────────────────────────────────────────

INSERT INTO firm_settings (firm_id)
SELECT id FROM firm
ON CONFLICT (firm_id) DO NOTHING;
