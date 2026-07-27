'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'
import type { CaseStatus } from '@/types/database.types'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns the current user's profile + firm_id or throws. */
async function requireFirmMember() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name, status')
    .eq('id', user.id)
    .single()

  if (!profile || !['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
    redirect('/auth/login')
  }

  if (profile.status === 'deactivated') {
    redirect('/auth/login')
  }

  return { supabase, user, profile }
}

// ─────────────────────────────────────────────────────────────
// CREATE CLIENT (inline — called from new-case form)
// PRD §2.2: Firm Admin ✓, Attorney ✓, Staff ✗
// ─────────────────────────────────────────────────────────────
export async function createClient_action(formData: FormData): Promise<{ id: string } | { error: string }> {
  const { supabase, profile } = await requireFirmMember()

  // Only firm_admin and attorney can create clients
  if (!['firm_admin', 'attorney'].includes(profile.role)) {
    return { error: 'Only attorneys and firm admins can create clients.' }
  }

  const name  = (formData.get('name')  as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const phone = (formData.get('phone') as string)?.trim() || null

  if (!name || !email) return { error: 'Name and email are required.' }

  const { data, error } = await supabase
    .from('client')
    .insert({
      firm_id:       profile.firm_id,
      name,
      email,
      phone,
      portal_access: false,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A client with that email already exists.' }
    return { error: error.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'client.created',
    entityType: 'client',
    entityId:   data.id,
    payload:    { name, email },
  })

  revalidatePath('/cases/new')
  return { id: data.id }
}

// ─────────────────────────────────────────────────────────────
// CREATE CASE
// PRD §2.2: Firm Admin ✓, Attorney ✓, Staff ✗
// ─────────────────────────────────────────────────────────────
export async function createCase(formData: FormData) {
  const { supabase, profile } = await requireFirmMember()

  // Only firm_admin and attorney can create cases
  if (!['firm_admin', 'attorney'].includes(profile.role)) {
    redirect('/cases?error=insufficient_permissions')
  }

  const title          = (formData.get('title')           as string)?.trim()
  const clientId       = formData.get('client_id')        as string
  const matterType     = formData.get('matter_type')      as string
  const assignedUserId = (formData.get('assigned_user_id') as string) || null
  const status         = (formData.get('status')          as CaseStatus) || 'intake'

  if (!title || !clientId || !matterType) {
    redirect('/cases/new?error=missing_fields')
  }

  const { data, error } = await supabase
    .from('case')
    .insert({
      firm_id:          profile.firm_id,
      client_id:        clientId,
      title,
      matter_type:      matterType,
      status,
      assigned_user_id: assignedUserId,
    })
    .select('id')
    .single()

  if (error) {
    redirect(`/cases/new?error=${encodeURIComponent(error.message)}`)
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'case.created',
    entityType: 'case',
    entityId:   data.id,
    payload:    { title, matter_type: matterType, status, client_id: clientId },
  })

  revalidatePath('/cases')
  redirect(`/cases/${data.id}`)
}

// ─────────────────────────────────────────────────────────────
// UPDATE CASE (status + assignment)
// PRD §2.2: Firm Admin ✓ (all cases), Attorney ✓ (assigned only — enforced by RLS)
// DB triggers handle audit logging for these changes.
// ─────────────────────────────────────────────────────────────
export async function updateCase(
  caseId: string,
  updates: {
    status?:          CaseStatus
    assigned_user_id?: string | null
    title?:           string
    matter_type?:     string
  }
) {
  const { supabase, profile } = await requireFirmMember()

  // Only firm_admin and attorney can update cases
  if (!['firm_admin', 'attorney'].includes(profile.role)) {
    throw new Error('Only attorneys and firm admins can update cases')
  }

  const { error } = await supabase
    .from('case')
    .update(updates)
    .eq('id', caseId)

  if (error) throw new Error(error.message)

  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/cases')
}

// ─────────────────────────────────────────────────────────────
// UPDATE CASE (via form, for server action use)
// ─────────────────────────────────────────────────────────────
export async function updateCaseForm(caseId: string, formData: FormData) {
  const status         = formData.get('status') as CaseStatus | null
  const assignedUserId = formData.get('assigned_user_id') as string | null

  const updates: Record<string, unknown> = {}
  if (status)                                updates.status = status
  // Allow explicit unassignment (empty string → null)
  if (assignedUserId !== null)               updates.assigned_user_id = assignedUserId || null

  await updateCase(caseId, updates as Parameters<typeof updateCase>[1])
  redirect(`/cases/${caseId}`)
}
