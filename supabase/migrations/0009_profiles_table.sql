-- ============================================================
-- JusticeHub — 0009_profiles_table.sql
-- Phase 2 Chunk 3: Extended user profiles, auto-creation trigger,
-- backfill, and RLS policies.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE profiles TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  user_id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id                  uuid REFERENCES firm(id) ON DELETE CASCADE,
  display_name             text NOT NULL,
  title                    text,
  avatar_url               text,
  bio                      text CHECK (char_length(bio) <= 140),
  phone                    text,
  bar_number               text,
  practice_areas           text[] NOT NULL DEFAULT '{}',
  hourly_rate              numeric(10,2) NOT NULL DEFAULT 0.00,
  show_phone_to_clients    boolean NOT NULL DEFAULT false,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferred_language       text NOT NULL DEFAULT 'en',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_firm_id_idx ON profiles(firm_id);

-- ─────────────────────────────────────────────────────────────
-- 2. ENABLE RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read profiles within their own firm
CREATE POLICY "profiles: firm members read same-firm"
  ON profiles FOR SELECT
  USING (firm_id = my_firm_id() OR user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY "profiles: user update own"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "profiles: user insert own"
  ON profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Super admin can read all profiles
CREATE POLICY "profiles: super_admin read all"
  ON profiles FOR SELECT
  USING (is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. AUTO-CREATION TRIGGERS FOR PROFILES
-- ─────────────────────────────────────────────────────────────

-- Function to auto-create profile row when user_profile is inserted
CREATE OR REPLACE FUNCTION auto_create_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (user_id, firm_id, display_name)
  VALUES (NEW.id, NEW.firm_id, NEW.full_name)
  ON CONFLICT (user_id) DO UPDATE
  SET firm_id = EXCLUDED.firm_id,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profile_auto_create_profile ON user_profile;
CREATE TRIGGER user_profile_auto_create_profile
  AFTER INSERT ON user_profile
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_profile_for_user();

-- ─────────────────────────────────────────────────────────────
-- 4. BACKFILL EXISTING USERS
-- ─────────────────────────────────────────────────────────────

INSERT INTO profiles (user_id, firm_id, display_name)
SELECT id, firm_id, full_name
FROM user_profile
ON CONFLICT (user_id) DO NOTHING;

-- Backfill client auth users
INSERT INTO profiles (user_id, firm_id, display_name, phone)
SELECT auth_user_id, firm_id, name, phone
FROM client
WHERE auth_user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
