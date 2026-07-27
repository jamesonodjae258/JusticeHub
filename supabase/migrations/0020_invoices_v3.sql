-- ============================================================
-- JusticeHub — 0020_invoices_v3.sql
-- Phase 2 Chunk 11: Invoices table schema, url_token UUID,
-- RLS policies, and private PDF storage bucket.
-- ============================================================

-- 1. CREATE invoices TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES "case"(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  firm_id          uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  invoice_number   text NOT NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'overdue')),
  issue_date       date NOT NULL DEFAULT CURRENT_DATE,
  due_date         date NOT NULL,
  line_items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal         numeric(10,2) NOT NULL DEFAULT 0.00,
  tax_amount       numeric(10,2) NOT NULL DEFAULT 0.00,
  total_amount     numeric(10,2) NOT NULL DEFAULT 0.00,
  pdf_url          text NULL,
  sent_at          timestamptz NULL,
  paid_at          timestamptz NULL,
  reminder_sent_at timestamptz NULL,
  url_token        uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_terms    text NULL,
  bank_details     text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_case_idx ON invoices(case_id);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices(client_id);
CREATE INDEX IF NOT EXISTS invoices_firm_idx ON invoices(firm_id);
CREATE INDEX IF NOT EXISTS invoices_url_token_idx ON invoices(url_token);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

-- 2. ENABLE RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Read: Attorneys and Firm Admins can read firm invoices
CREATE POLICY "invoices: firm staff read"
  ON invoices FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin', 'attorney', 'staff')
  );

-- Insert: Attorneys and Firm Admins can create invoices
CREATE POLICY "invoices: firm staff insert"
  ON invoices FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin', 'attorney')
  );

-- Update: Attorneys and Firm Admins can update firm invoices
CREATE POLICY "invoices: firm staff update"
  ON invoices FOR UPDATE
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin', 'attorney')
  );

-- Delete: Firm Admins and Super Admins can delete draft invoices
CREATE POLICY "invoices: admin delete draft"
  ON invoices FOR DELETE
  USING (
    firm_id = my_firm_id() AND
    status = 'draft' AND
    my_role() IN ('super_admin', 'firm_admin')
  );

-- Client portal access: Clients can read invoices issued to them
CREATE POLICY "invoices: client read own"
  ON invoices FOR SELECT
  USING (
    my_role() = 'client' AND
    client_id IN (
      SELECT id FROM client WHERE auth_user_id = auth.uid()
    )
  );

-- 3. PRIVATE STORAGE BUCKET FOR INVOICE PDFS
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Firm staff can read/write invoice PDFs
CREATE POLICY "invoices_bucket: staff select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "invoices_bucket: staff insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "invoices_bucket: staff update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');
