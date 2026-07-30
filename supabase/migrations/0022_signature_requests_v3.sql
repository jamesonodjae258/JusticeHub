-- ============================================================
-- JusticeHub — 0022_signature_requests_v3.sql
-- Phase 2 Chunk 13: Signature requests table schema, RLS policies,
-- and indexes for e-signature workflow.
-- ============================================================

CREATE TABLE IF NOT EXISTS signature_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES "case"(id) ON DELETE CASCADE,
  document_id          uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  firm_id              uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  client_id            uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'docuseal' CHECK (provider IN ('docuseal', 'docusign', 'adobe', 'native')),
  provider_envelope_id text NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined', 'expired')),
  requested_at         timestamptz NOT NULL DEFAULT now(),
  signed_at            timestamptz NULL,
  signed_doc_url       text NULL,
  last_reminded_at     timestamptz NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signature_requests_case_idx ON signature_requests(case_id);
CREATE INDEX IF NOT EXISTS signature_requests_doc_idx ON signature_requests(document_id);
CREATE INDEX IF NOT EXISTS signature_requests_firm_idx ON signature_requests(firm_id);
CREATE INDEX IF NOT EXISTS signature_requests_envelope_idx ON signature_requests(provider_envelope_id);
CREATE INDEX IF NOT EXISTS signature_requests_status_idx ON signature_requests(status);

-- ENABLE RLS
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

-- Insert: ONLY attorneys can create signature requests
DROP POLICY IF EXISTS "signature_requests: attorney insert" ON signature_requests;
CREATE POLICY "signature_requests: attorney insert"
  ON signature_requests FOR INSERT
  WITH CHECK (
    firm_id = my_firm_id() AND
    my_role() = 'attorney'
  );

-- Select: Firm staff and recipient client can view signature requests
DROP POLICY IF EXISTS "signature_requests: select" ON signature_requests;
CREATE POLICY "signature_requests: select"
  ON signature_requests FOR SELECT
  USING (
    firm_id = my_firm_id() OR
    my_role() = 'client'
  );

-- Update: Firm staff can update signature requests
DROP POLICY IF EXISTS "signature_requests: staff update" ON signature_requests;
CREATE POLICY "signature_requests: staff update"
  ON signature_requests FOR UPDATE
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('super_admin', 'firm_admin', 'attorney', 'staff')
  );
