-- ============================================================
-- JusticeHub — 0016_activity_and_login_audit.sql
-- Phase 2 Chunk 2: Activity log, login audit, notifications,
-- Postgres triggers, immutability rules, and RLS policies.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE TABLES
-- ─────────────────────────────────────────────────────────────

-- 1. ACTIVITY LOG TABLE
CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  actor_id    uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  text NULL,
  action      text NOT NULL, -- e.g. 'case.created', 'document.uploaded', 'user.deactivated'
  entity_type text NOT NULL, -- e.g. 'case', 'document', 'client', 'invoice', 'note', 'user'
  entity_id   uuid NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_firm_idx ON activity_log(firm_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS login_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  firm_id     uuid NULL REFERENCES firm(id) ON DELETE SET NULL,
  ip_address  text NOT NULL DEFAULT '127.0.0.1',
  device      text NOT NULL DEFAULT 'Unknown Device',
  user_agent  text NULL,
  success     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS firm_id uuid NULL REFERENCES firm(id) ON DELETE SET NULL;
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS device text NOT NULL DEFAULT 'Unknown Device';
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true;
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS login_audit_firm_idx ON login_audit(firm_id);
CREATE INDEX IF NOT EXISTS login_audit_user_idx ON login_audit(user_id);
CREATE INDEX IF NOT EXISTS login_audit_created_idx ON login_audit(created_at DESC);

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
  recipient_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role text NULL,
  event_type     text NOT NULL,
  entity_type    text NOT NULL,
  entity_id      uuid NULL,
  message        text NOT NULL,
  read           boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id);

-- ─────────────────────────────────────────────────────────────
-- 2. IMMUTABILITY POSTGRES RULES
-- Enforces that UPDATE and DELETE queries fail silently at DB level
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE RULE no_update_activity_log AS ON UPDATE TO activity_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_activity_log AS ON DELETE TO activity_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_update_login_audit AS ON UPDATE TO login_audit DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_login_audit AS ON DELETE TO login_audit DO INSTEAD NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. POSTGRES TRIGGER FUNCTION FOR AUTOMATIC ACTIVITY & NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_log_table_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_firm_id     uuid;
  v_actor_id    uuid;
  v_actor_role  text;
  v_action      text;
  v_entity_type text;
  v_entity_id   uuid;
  v_metadata    jsonb;
  v_msg         text;
BEGIN
  v_actor_id   := auth.uid();
  v_actor_role := my_role();
  v_entity_type:= TG_TABLE_NAME;

  IF TG_TABLE_NAME = 'case' THEN
    IF TG_OP = 'INSERT' THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'case.created';
      v_metadata  := jsonb_build_object('title', NEW.title, 'matter_type', NEW.matter_type);
      v_msg       := 'New case created: ' || NEW.title;
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'case.status_changed';
      v_metadata  := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
      v_msg       := 'Case status updated to ' || NEW.status;
    END IF;

  ELSIF TG_TABLE_NAME = 'document' THEN
    IF TG_OP = 'INSERT' THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'document.uploaded';
      v_metadata  := jsonb_build_object('filename', NEW.filename, 'case_id', NEW.case_id);
      v_msg       := 'Document uploaded: ' || NEW.filename;
    ELSIF TG_OP = 'UPDATE' AND OLD.visible_to_client <> NEW.visible_to_client THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'document.visibility_toggled';
      v_metadata  := jsonb_build_object('visible_to_client', NEW.visible_to_client);
      v_msg       := 'Document client visibility changed for ' || NEW.filename;
    END IF;

  ELSIF TG_TABLE_NAME = 'user_profile' THEN
    IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status AND NEW.status = 'deactivated' THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'user.deactivated';
      v_metadata  := jsonb_build_object('full_name', NEW.full_name);
      v_msg       := 'User account deactivated: ' || NEW.full_name;
    ELSIF TG_OP = 'UPDATE' AND OLD.role <> NEW.role THEN
      v_firm_id   := NEW.firm_id;
      v_entity_id := NEW.id;
      v_action    := 'user.promoted';
      v_metadata  := jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role);
      v_msg       := 'User role updated to ' || NEW.role;
    END IF;
  END IF;

  -- Insert into activity_log if action recognized
  IF v_action IS NOT NULL THEN
    INSERT INTO activity_log (firm_id, actor_id, actor_role, action, entity_type, entity_id, metadata)
    VALUES (v_firm_id, v_actor_id, v_actor_role, v_action, v_entity_type, v_entity_id, v_metadata);

    -- Insert notification for firm admins / attorneys
    IF v_msg IS NOT NULL THEN
      INSERT INTO notifications (firm_id, recipient_id, recipient_role, event_type, entity_type, entity_id, message)
      SELECT v_firm_id, up.id, up.role, v_action, v_entity_type, v_entity_id, v_msg
      FROM user_profile up
      WHERE up.firm_id = v_firm_id AND up.role IN ('super_admin', 'firm_admin') AND up.id <> COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_activity ON "case";
CREATE TRIGGER trg_case_activity AFTER INSERT OR UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION trg_log_table_activity();

DROP TRIGGER IF EXISTS trg_document_activity ON document;
CREATE TRIGGER trg_document_activity AFTER INSERT OR UPDATE ON document FOR EACH ROW EXECUTE FUNCTION trg_log_table_activity();

DROP TRIGGER IF EXISTS trg_user_profile_activity ON user_profile;
CREATE TRIGGER trg_user_profile_activity AFTER UPDATE ON user_profile FOR EACH ROW EXECUTE FUNCTION trg_log_table_activity();

-- ─────────────────────────────────────────────────────────────
-- 4. RLS POLICIES FOR activity_log, login_audit, AND notifications
-- ─────────────────────────────────────────────────────────────

-- A. ACTIVITY LOG RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log: super_admin read all" ON activity_log;
CREATE POLICY "activity_log: super_admin read all"
  ON activity_log FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "activity_log: firm_admin read features only" ON activity_log;
CREATE POLICY "activity_log: firm_admin read features only"
  ON activity_log FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() = 'firm_admin' AND
    entity_type IN ('case', 'document', 'client', 'invoice', 'note')
  );

DROP POLICY IF EXISTS "activity_log: lawyer read assigned cases" ON activity_log;
CREATE POLICY "activity_log: lawyer read assigned cases"
  ON activity_log FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() IN ('attorney', 'staff') AND
    entity_type = 'case' AND
    EXISTS (
      SELECT 1 FROM "case" c
      WHERE c.id = activity_log.entity_id AND (
        c.assigned_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM case_document_access cda WHERE cda.case_id = c.id AND cda.user_id = auth.uid())
      )
    )
  );

-- B. LOGIN AUDIT RLS
ALTER TABLE login_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_audit: super_admin read only" ON login_audit;
CREATE POLICY "login_audit: super_admin read only"
  ON login_audit FOR SELECT
  USING (
    firm_id = my_firm_id() AND
    my_role() = 'super_admin'
  );

-- C. NOTIFICATIONS RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: recipient read self" ON notifications;
CREATE POLICY "notifications: recipient read self"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications: recipient update self" ON notifications;
CREATE POLICY "notifications: recipient update self"
  ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());
