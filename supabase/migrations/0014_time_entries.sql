-- ============================================================
-- JusticeHub — 0014_time_entries.sql
-- Phase 2 Chunk 7: Time tracking table, attorney-only RLS,
-- and billed-entry immutability trigger.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE time_entries TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS time_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES "case"(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id          uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  entry_date       date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  hourly_rate      numeric(10,2) NOT NULL DEFAULT 0.00,
  is_billable      boolean NOT NULL DEFAULT true,
  description      text NOT NULL,
  invoice_id       uuid NULL, -- NULL until added to an invoice (prevents double-billing)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_entries_case_idx ON time_entries(case_id);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS time_entries_firm_idx ON time_entries(firm_id);
CREATE INDEX IF NOT EXISTS time_entries_invoice_idx ON time_entries(invoice_id);

-- ─────────────────────────────────────────────────────────────
-- 2. ENABLE RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Read: Firm members can read time entries in their firm
CREATE POLICY "time_entries: firm members read"
  ON time_entries FOR SELECT
  USING (firm_id = my_firm_id());

-- Insert: ONLY attorneys and firm admins can insert time entries
CREATE POLICY "time_entries: attorney insert"
  ON time_entries FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id() AND
    my_role() IN ('attorney', 'firm_admin')
  );

-- Update: Creator or firm admin can update unbilled entries
CREATE POLICY "time_entries: creator update unbilled"
  ON time_entries FOR UPDATE
  USING (
    firm_id = my_firm_id() AND
    (user_id = auth.uid() OR is_firm_admin()) AND
    invoice_id IS NULL
  );

-- Delete: Creator or firm admin can delete unbilled entries
CREATE POLICY "time_entries: creator delete unbilled"
  ON time_entries FOR DELETE
  USING (
    firm_id = my_firm_id() AND
    (user_id = auth.uid() OR is_firm_admin()) AND
    invoice_id IS NULL
  );

-- Super admin read access
CREATE POLICY "time_entries: super_admin read all"
  ON time_entries FOR SELECT
  USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. POSTGRES TRIGGER: BILLED ENTRIES ARE IMMUTABLE
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_billed_time_entry_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If entry was billed (invoice_id was not null), prevent changing entry details
  IF OLD.invoice_id IS NOT NULL AND (
    OLD.duration_minutes <> NEW.duration_minutes OR
    OLD.hourly_rate <> NEW.hourly_rate OR
    OLD.description <> NEW.description OR
    OLD.entry_date <> NEW.entry_date OR
    OLD.is_billable <> NEW.is_billable
  ) THEN
    RAISE EXCEPTION 'Billed time entries are locked and cannot be edited.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_billed_time_entries ON time_entries;
CREATE TRIGGER lock_billed_time_entries
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_billed_time_entry_modification();
