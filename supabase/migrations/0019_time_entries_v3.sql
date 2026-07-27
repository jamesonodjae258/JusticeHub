-- ============================================================
-- JusticeHub — 0019_time_entries_v3.sql
-- Phase 2 Chunk 10 (PRD v3.0): Attorney-only time logging RLS,
-- firm_admin exclusion, and full immutability lock for billed entries.
-- ============================================================

-- 1. Ensure columns exist with standard aliases
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rate_per_hour numeric(10,2) NOT NULL DEFAULT 0.00;

-- Sync columns if legacy entry_date or hourly_rate exist
UPDATE time_entries SET date = entry_date WHERE date IS NULL AND entry_date IS NOT NULL;
UPDATE time_entries SET rate_per_hour = hourly_rate WHERE (rate_per_hour IS NULL OR rate_per_hour = 0) AND hourly_rate > 0;

-- 2. Drop legacy RLS policies
DROP POLICY IF EXISTS "time_entries: firm members read" ON time_entries;
DROP POLICY IF EXISTS "time_entries: attorney insert" ON time_entries;
DROP POLICY IF EXISTS "time_entries: creator update unbilled" ON time_entries;
DROP POLICY IF EXISTS "time_entries: creator delete unbilled" ON time_entries;
DROP POLICY IF EXISTS "time_entries: super_admin read all" ON time_entries;

-- 3. PRD v3.0 RLS POLICIES
-- Select: ONLY attorneys assigned to the case or super_admin can read time entries
CREATE POLICY "time_entries: attorney read assigned"
  ON time_entries FOR SELECT
  USING (
    firm_id = my_firm_id() AND (
      (my_role() = 'attorney' AND user_id = auth.uid()) OR
      is_super_admin()
    )
  );

-- Insert: ONLY attorneys can create time entries
CREATE POLICY "time_entries: attorney insert"
  ON time_entries FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id() AND
    my_role() = 'attorney' AND
    user_id = auth.uid()
  );

-- Update: ONLY creating attorney can update unbilled entries
CREATE POLICY "time_entries: attorney update unbilled"
  ON time_entries FOR UPDATE
  USING (
    firm_id = my_firm_id() AND
    my_role() = 'attorney' AND
    user_id = auth.uid() AND
    invoice_id IS NULL
  );

-- Delete: ONLY creating attorney can delete unbilled entries
CREATE POLICY "time_entries: attorney delete unbilled"
  ON time_entries FOR DELETE
  USING (
    firm_id = my_firm_id() AND
    my_role() = 'attorney' AND
    user_id = auth.uid() AND
    invoice_id IS NULL
  );

-- 4. FULL IMMUTABILITY TRIGGER FOR BILLED ENTRIES ON UPDATE AND DELETE
CREATE OR REPLACE FUNCTION prevent_billed_time_entry_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Billed time entries are locked and cannot be edited or deleted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_billed_time_entries ON time_entries;
DROP TRIGGER IF EXISTS lock_billed_time_entries ON time_entries;

CREATE TRIGGER trg_lock_billed_time_entries
  BEFORE UPDATE OR DELETE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_billed_time_entry_modification();
