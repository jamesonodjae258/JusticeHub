-- ============================================================
-- JusticeHub — 0021_invoice_reminders_v3.sql
-- Phase 2 Chunk 12: Invoice reminders table with idempotency lock,
-- and public SELECT RLS policy for hosted invoices (/invoice/[url_token]).
-- ============================================================

-- 1. CREATE invoice_reminders TABLE
CREATE TABLE IF NOT EXISTS invoice_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL CHECK (type IN ('7day', '14day')),
  CONSTRAINT invoice_reminders_unique UNIQUE (invoice_id, type)
);

CREATE INDEX IF NOT EXISTS invoice_reminders_invoice_idx ON invoice_reminders(invoice_id);

-- ENABLE RLS
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reminders: staff read"
  ON invoice_reminders FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "invoice_reminders: staff insert"
  ON invoice_reminders FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 2. PUBLIC SELECT RLS POLICY FOR HOSTE D INVOICE VIEW (/invoice/[url_token])
-- Anyone with a valid url_token UUID can read the invoice row (for hosted billing page)
DROP POLICY IF EXISTS "invoices: public read via url_token" ON invoices;
CREATE POLICY "invoices: public read via url_token"
  ON invoices FOR SELECT
  USING (url_token IS NOT NULL);
