'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'

// Helper to authenticate a firm member and return details
async function requireFirmMember() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, status')
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
// CREATE CASE EVENT (Court Date / Filing Deadline)
// PRD §2.2: Firm Admin ✓, Attorney ✓, Staff ✓
// ─────────────────────────────────────────────────────────────
export async function createCaseEvent(formData: FormData) {
  const { supabase, profile } = await requireFirmMember()

  const caseId = formData.get('case_id') as string
  const title = (formData.get('title') as string)?.trim()
  const eventDate = formData.get('event_date') as string
  const visibleToClient = formData.get('visible_to_client') === 'true'

  if (!caseId || !title || !eventDate) {
    throw new Error('Case ID, title, and date are required.')
  }

  const { data: event, error: dbError } = await supabase
    .from('case_event')
    .insert({
      case_id: caseId,
      firm_id: profile.firm_id,
      title,
      event_date: eventDate,
      visible_to_client: visibleToClient,
    })
    .select('id')
    .single()

  if (dbError) {
    throw new Error('Failed to create event: ' + dbError.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'event.created',
    entityType: 'case_event',
    entityId: event.id,
    payload: { title, event_date: eventDate, visible_to_client: visibleToClient },
  })

  revalidatePath(`/cases/${caseId}`)
}

// ─────────────────────────────────────────────────────────────
// CREATE CASE NOTE (Internal Collaboration)
// PRD §2.2: Firm Admin ✓, Attorney ✓, Staff ✓
// ─────────────────────────────────────────────────────────────
export async function createCaseNote(formData: FormData) {
  const { supabase, profile } = await requireFirmMember()

  const caseId = formData.get('case_id') as string
  const body = (formData.get('body') as string)?.trim()

  if (!caseId || !body) {
    throw new Error('Case ID and note content are required.')
  }

  const { data: note, error: dbError } = await supabase
    .from('note')
    .insert({
      case_id: caseId,
      firm_id: profile.firm_id,
      author_id: profile.id,
      body,
    })
    .select('id')
    .single()

  if (dbError) {
    throw new Error('Failed to create note: ' + dbError.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'note.created',
    entityType: 'note',
    entityId: note.id,
    payload: { preview: body.substring(0, 60) },
  })

  revalidatePath(`/cases/${caseId}`)
}
