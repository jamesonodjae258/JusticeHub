'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'

export interface CreateSignatureRequestPayload {
  caseId: string
  documentId: string
  clientId: string
  provider?: 'docuseal' | 'docusign' | 'adobe' | 'native'
}

export interface SignatureRequestItem {
  id: string
  document_id: string
  document_name: string
  client_id: string
  client_name: string
  provider: string
  provider_envelope_id: string | null
  status: 'pending' | 'signed' | 'declined' | 'expired'
  requested_at: string
  signed_at: string | null
  signed_doc_url: string | null
  last_reminded_at: string | null
}

/** Create new signature request (Attorney ONLY) */
export async function createSignatureRequest(payload: CreateSignatureRequestPayload): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'attorney') {
    return { success: false, error: 'Only attorneys can send signature requests.' }
  }

  const firmId = userProfile.firm_id
  const envelopeId = `env_${crypto.randomUUID().substring(0, 8)}`

  // 1. Insert signature_requests row
  const { data: newReq, error: insertErr } = await adminSupabase
    .from('signature_requests')
    .insert({
      case_id:              payload.caseId,
      document_id:          payload.documentId,
      firm_id:              firmId,
      client_id:            payload.clientId,
      provider:             payload.provider || 'docuseal',
      provider_envelope_id: envelopeId,
      status:               'pending',
      requested_at:         new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertErr || !newReq) {
    return { success: false, error: insertErr?.message || 'Failed to create signature request.' }
  }

  // 2. Update document tag in case hub to "Awaiting signature"
  await adminSupabase
    .from('document')
    .update({ tag: 'Awaiting signature', updated_at: new Date().toISOString() })
    .eq('id', payload.documentId)

  // 3. Send Client Notification
  const { data: client } = await adminSupabase
    .from('client')
    .select('auth_user_id, name')
    .eq('id', payload.clientId)
    .single()

  if (client?.auth_user_id) {
    await adminSupabase.from('notifications').insert({
      recipient_id: client.auth_user_id,
      event_type:   'signature.requested',
      message:      `Document signature requested for case.`,
      payload:      { request_id: newReq.id, document_id: payload.documentId },
    })
  }

  await writeAuditLog({
    firmId:     firmId,
    actorId:    user.id,
    action:     'document.signature_requested',
    entityType: 'signature_requests',
    entityId:   newReq.id,
    payload:    { document_id: payload.documentId, envelope_id: envelopeId },
  })

  revalidatePath(`/cases/${payload.caseId}`)
  return { success: true, requestId: newReq.id }
}

/** Send 24-hour rate limited follow-up reminder */
export async function sendSignatureReminder(requestId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: req } = await adminSupabase
    .from('signature_requests')
    .select('id, case_id, client_id, last_reminded_at, status')
    .eq('id', requestId)
    .single()

  if (!req) return { success: false, error: 'Signature request not found.' }
  if (req.status !== 'pending') return { success: false, error: 'Signature request is no longer pending.' }

  // Enforce 24-hour rate limit
  if (req.last_reminded_at) {
    const lastRemindedDate = new Date(req.last_reminded_at)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    if (lastRemindedDate > twentyFourHoursAgo) {
      return { success: false, error: 'Reminders can only be sent once every 24 hours.' }
    }
  }

  const nowIso = new Date().toISOString()
  await adminSupabase
    .from('signature_requests')
    .update({ last_reminded_at: nowIso, updated_at: nowIso })
    .eq('id', requestId)

  const { data: client } = await adminSupabase
    .from('client')
    .select('auth_user_id')
    .eq('id', req.client_id)
    .single()

  if (client?.auth_user_id) {
    await adminSupabase.from('notifications').insert({
      recipient_id: client.auth_user_id,
      event_type:   'signature.reminder',
      message:      `Reminder: Please sign your pending document.`,
      payload:      { request_id: req.id },
    })
  }

  revalidatePath(`/cases/${req.case_id}`)
  return { success: true }
}

/** 48-hour polling fallback background runner */
export async function pollPendingSignatureRequests(): Promise<{ updatedCount: number }> {
  const adminSupabase = await createAdminClient()

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // Fetch pending signature requests older than 48 hours
  const { data: pendingReqs } = await adminSupabase
    .from('signature_requests')
    .select('id, case_id, document_id, requested_at')
    .eq('status', 'pending')
    .lte('requested_at', fortyEightHoursAgo)

  let updatedCount = 0

  for (const r of pendingReqs ?? []) {
    // Check provider API or simulate status verification
    // For fallback check: if verified, auto-complete or log status check
    await adminSupabase
      .from('signature_requests')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', r.id)

    updatedCount++
  }

  return { updatedCount }
}

/** Fetch signature requests for a case */
export async function getSignatureRequestsForCase(caseId: string): Promise<SignatureRequestItem[]> {
  const adminSupabase = await createAdminClient()

  const { data: reqs } = await adminSupabase
    .from('signature_requests')
    .select(`
      id,
      document_id,
      client_id,
      provider,
      provider_envelope_id,
      status,
      requested_at,
      signed_at,
      signed_doc_url,
      last_reminded_at,
      doc:document(filename),
      cli:client(name)
    `)
    .eq('case_id', caseId)
    .order('requested_at', { ascending: false })

  return (reqs ?? []).map(r => ({
    id:                   r.id,
    document_id:          r.document_id,
    document_name:        (r.doc as any)?.filename || 'Document',
    client_id:            r.client_id,
    client_name:          (r.cli as any)?.name || 'Client',
    provider:             r.provider,
    provider_envelope_id: r.provider_envelope_id,
    status:               r.status as any,
    requested_at:         r.requested_at,
    signed_at:            r.signed_at,
    signed_doc_url:       r.signed_doc_url,
    last_reminded_at:     r.last_reminded_at,
  }))
}
