export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ──────────────────────────────────────────────────
// Role type — shared across the app
// Phase 2: Extended from 3 to 5 roles
// ──────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'firm_admin' | 'attorney' | 'staff' | 'client'

export type UserStatus = 'active' | 'deactivated'

export type CaseStatus = 'intake' | 'active' | 'awaiting_court' | 'closed'

// ──────────────────────────────────────────────────
// Row types (what Supabase returns from SELECT *)
// ──────────────────────────────────────────────────
export interface FirmRow {
  id: string
  name: string
  slug: string
  plan_tier: string
  created_at: string
}

export interface UserProfileRow {
  id: string
  firm_id: string
  full_name: string
  role: UserRole
  status: UserStatus
  deactivated_at: string | null
  deactivated_by: string | null
  created_at: string
}

export interface ClientRow {
  id: string
  firm_id: string
  name: string
  email: string
  phone: string | null
  portal_access: boolean
  auth_user_id: string | null
  created_at: string
}

export interface CaseRow {
  id: string
  firm_id: string
  client_id: string
  title: string
  matter_type: string
  status: CaseStatus
  assigned_user_id: string | null
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  case_id: string
  firm_id: string
  filename: string
  storage_path: string
  tag: string | null
  visible_to_client: boolean
  uploaded_by: string | null
  created_at: string
}

export interface CaseEventRow {
  id: string
  case_id: string
  firm_id: string
  title: string
  event_date: string   // 'YYYY-MM-DD'
  visible_to_client: boolean
  created_at: string
}

export interface NoteRow {
  id: string
  case_id: string
  firm_id: string
  author_id: string | null
  body: string
  created_at: string
}

export interface AuditLogRow {
  id: string
  firm_id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string
  payload: Json | null
  created_at: string
}

// Phase 2 — Super Admin audit log (immutable)
export interface SuperAdminAuditLogRow {
  id: string
  super_admin_id: string
  action: string
  target_type: string
  target_id: string | null
  ip_address: string | null
  created_at: string
}

// Phase 2 — Case document access grants (Staff content access)
export interface CaseDocumentAccessRow {
  id: string
  case_id: string
  user_id: string
  firm_id: string
  granted_by: string
  created_at: string
}

// Phase 2 — Firm invitations (team member invites)
export type InviteRole = 'attorney' | 'staff'
export type InviteStatus = 'pending' | 'accepted' | 'expired'

export interface FirmInvitationRow {
  id: string
  firm_id: string
  email: string
  full_name: string
  role: InviteRole
  invited_by: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

// Phase 2 — Profiles
export type PracticeArea =
  | 'Civil'
  | 'Criminal'
  | 'Corporate'
  | 'Family'
  | 'Property'
  | 'Immigration'
  | 'Labour'
  | 'Other'

export interface ProfileRow {
  user_id: string
  firm_id: string
  display_name: string
  title: string | null
  avatar_url: string | null
  avatar_signed_url?: string | null
  bio: string | null
  phone: string | null
  bar_number: string | null
  practice_areas: PracticeArea[]
  hourly_rate: number
  show_phone_to_clients: boolean
  notification_preferences: Json
  preferred_language: string
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────
// Insert types (what you pass to INSERT)
// ──────────────────────────────────────────────────
export type InsertFirm                = Omit<FirmRow, 'id' | 'created_at'>
export type InsertUserProfile         = Omit<UserProfileRow, 'created_at' | 'deactivated_at' | 'deactivated_by'>
export type InsertClient              = Omit<ClientRow, 'id' | 'created_at'>
export type InsertCase                = Omit<CaseRow, 'id' | 'created_at' | 'updated_at'>
export type InsertDocument            = Omit<DocumentRow, 'id' | 'created_at'>
export type InsertCaseEvent           = Omit<CaseEventRow, 'id' | 'created_at'>
export type InsertNote                = Omit<NoteRow, 'id' | 'created_at'>
export type InsertCaseDocumentAccess  = Omit<CaseDocumentAccessRow, 'id' | 'created_at'>
export type InsertFirmInvitation      = Omit<FirmInvitationRow, 'id' | 'token' | 'created_at' | 'accepted_at'>

// ──────────────────────────────────────────────────
// Update types
// ──────────────────────────────────────────────────
export type UpdateCase      = Partial<Pick<CaseRow, 'title' | 'matter_type' | 'status' | 'assigned_user_id'>>
export type UpdateDocument  = Partial<Pick<DocumentRow, 'tag' | 'visible_to_client'>>
export type UpdateCaseEvent = Partial<Pick<CaseEventRow, 'title' | 'event_date' | 'visible_to_client'>>

