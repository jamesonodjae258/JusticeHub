'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'

// ─────────────────────────────────────────────────────────────
// ROLE TYPES for clarity
// ─────────────────────────────────────────────────────────────
type FirmRole = 'firm_admin' | 'attorney' | 'staff'

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

  return { supabase, user, profile: profile as typeof profile & { role: FirmRole } }
}

// Helper to check user session (staff or client)
async function requireUser() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('Unauthenticated')

  // Load profile to verify they exist as user_profile (staff) or client (client portal)
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, status')
    .eq('id', user.id)
    .single()

  if (profile) {
    if (profile.status === 'deactivated') throw new Error('Account deactivated')
    return { supabase, user, role: profile.role, firmId: profile.firm_id }
  }

  const { data: clientRecord } = await supabase
    .from('client')
    .select('id, firm_id')
    .eq('auth_user_id', user.id)
    .single()

  if (clientRecord) {
    return { supabase, user, role: 'client' as const, firmId: clientRecord.firm_id }
  }

  throw new Error('Unauthorized')
}

// ─────────────────────────────────────────────────────────────
// UPLOAD DOCUMENT
// PRD §2.2: Attorney ✓, Staff ✓ (upload allowed), Firm Admin ✗
// ─────────────────────────────────────────────────────────────
export async function uploadDocument(formData: FormData) {
  const { supabase, profile } = await requireFirmMember()

  // Only attorney and staff can upload documents
  if (!['attorney', 'staff'].includes(profile.role)) {
    throw new Error('Only attorneys and staff can upload documents')
  }

  const caseId = formData.get('case_id') as string
  const tag = formData.get('tag') as string || 'Other'
  const visibleToClient = formData.get('visible_to_client') === 'true'
  const file = formData.get('file') as File

  if (!caseId || !file || file.size === 0) {
    throw new Error('Case ID and file are required.')
  }

  if (file.size > 10485760) {
    throw new Error('File size exceeds the 10MB limit.')
  }

  const filename = file.name
  const uuid = crypto.randomUUID()
  const storagePath = `${profile.firm_id}/${caseId}/${uuid}-${filename}`

  // Convert File to Buffer for Supabase Upload compatibility
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload file via admin client (bypasses RLS on storage bucket)
  const admin = await createAdminClient()
  const { error: uploadError } = await admin.storage
    .from('case-documents')
    .upload(storagePath, buffer, {
      contentType: file.type,
      duplex: 'half',
    })

  if (uploadError) {
    console.error('[storage] Upload failed:', uploadError.message)
    throw new Error('Storage upload failed: ' + uploadError.message)
  }

  // Insert row in document database table
  const { data: doc, error: dbError } = await supabase
    .from('document')
    .insert({
      case_id: caseId,
      firm_id: profile.firm_id,
      filename,
      storage_path: storagePath,
      tag,
      visible_to_client: visibleToClient,
      uploaded_by: profile.id,
    })
    .select('id')
    .single()

  if (dbError) {
    // Cleanup storage file on database failure
    await admin.storage.from('case-documents').remove([storagePath])
    throw new Error('Database registry failed: ' + dbError.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: doc.id,
    payload: { filename, tag, visible_to_client: visibleToClient },
  })

  revalidatePath(`/cases/${caseId}`)
}

// ─────────────────────────────────────────────────────────────
// DELETE DOCUMENT
// PRD §2.2: Only Attorney can edit/delete documents
// ─────────────────────────────────────────────────────────────
export async function deleteDocument(docId: string) {
  const { supabase, profile } = await requireFirmMember()

  // Only attorneys can delete documents
  if (profile.role !== 'attorney') {
    throw new Error('Only attorneys can delete documents')
  }

  // Fetch document details to verify ownership and get storage path
  const { data: doc, error: fetchErr } = await supabase
    .from('document')
    .select('case_id, filename, storage_path')
    .eq('id', docId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (fetchErr || !doc) {
    throw new Error('Document not found or unauthorized')
  }

  // Delete database record (handles DB RLS validation)
  const { error: dbError } = await supabase
    .from('document')
    .delete()
    .eq('id', docId)

  if (dbError) {
    throw new Error('Failed to delete document metadata: ' + dbError.message)
  }

  // Delete physical storage object via admin storage client
  const admin = await createAdminClient()
  const { error: storageError } = await admin.storage
    .from('case-documents')
    .remove([doc.storage_path])

  if (storageError) {
    console.error('[storage] Failed to delete file object:', storageError.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'document.deleted',
    entityType: 'document',
    entityId: docId,
    payload: { filename: doc.filename },
  })

  revalidatePath(`/cases/${doc.case_id}`)
}

// ─────────────────────────────────────────────────────────────
// TOGGLE DOCUMENT VISIBILITY
// PRD §2.2: Only Attorney can edit documents
// ─────────────────────────────────────────────────────────────
export async function toggleDocumentVisibility(docId: string, visible: boolean) {
  const { supabase, profile } = await requireFirmMember()

  // Only attorneys can toggle document visibility
  if (profile.role !== 'attorney') {
    throw new Error('Only attorneys can change document visibility')
  }

  const { data: doc, error: fetchErr } = await supabase
    .from('document')
    .select('case_id, filename')
    .eq('id', docId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (fetchErr || !doc) {
    throw new Error('Document not found or unauthorized')
  }

  const { error: updateErr } = await supabase
    .from('document')
    .update({ visible_to_client: visible })
    .eq('id', docId)

  if (updateErr) {
    throw new Error('Failed to update visibility: ' + updateErr.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'document.visibility_toggled',
    entityType: 'document',
    entityId: docId,
    payload: { filename: doc.filename, visible_to_client: visible },
  })

  revalidatePath(`/cases/${doc.case_id}`)
}

// ─────────────────────────────────────────────────────────────
// GET SIGNED DOWNLOAD URL
//
// CRITICAL ENFORCEMENT POINT for document content restriction:
//   - firm_admin → BLOCKED (can see metadata only, never file content)
//   - staff      → CHECK case_document_access for explicit grant
//   - attorney   → ALLOWED (full access)
//   - client     → ALLOWED (RLS already scopes to visible docs)
// ─────────────────────────────────────────────────────────────
export async function getSignedDownloadUrl(docId: string): Promise<string> {
  const { supabase, user, role, firmId } = await requireUser()

  // ── Layer 3: Application-level role check ──────────────────
  // (Layer 1 = Storage RLS; Layer 2 = Document table RLS)

  if (role === 'firm_admin') {
    throw new Error('Document content access is restricted for Firm Admin. You can view document metadata (name, tag, dates) but not the file contents.')
  }

  if (role === 'staff') {
    // Staff must have an explicit grant from an Attorney for this case
    const { data: doc } = await supabase
      .from('document')
      .select('case_id')
      .eq('id', docId)
      .single()

    if (!doc) {
      throw new Error('Document not found')
    }

    const { data: grant } = await supabase
      .from('case_document_access')
      .select('id')
      .eq('case_id', doc.case_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!grant) {
      throw new Error('Document content access not granted for this case. An attorney must grant you access first.')
    }
  }

  // Fetch document row using user-bound client to enforce table-level RLS policies.
  // Clients can only query visible docs on their own cases; attorneys can query same-firm docs.
  const { data: doc, error: fetchErr } = await supabase
    .from('document')
    .select('filename, storage_path')
    .eq('id', docId)
    .single()

  if (fetchErr || !doc) {
    throw new Error('Unauthorized or file not found')
  }

  // Generate signed URL via admin client (valid for 60 seconds)
  const admin = await createAdminClient()
  const { data, error: storageErr } = await admin.storage
    .from('case-documents')
    .createSignedUrl(doc.storage_path, 60)

  if (storageErr || !data?.signedUrl) {
    throw new Error('Failed to generate download link: ' + storageErr?.message)
  }

  // Log audit trail
  await writeAuditLog({
    firmId: firmId,
    actorId: user.id,
    action: 'document.downloaded',
    entityType: 'document',
    entityId: docId,
    payload: { filename: doc.filename, role },
  })

  return data.signedUrl
}

// ─────────────────────────────────────────────────────────────
// GRANT DOCUMENT ACCESS TO STAFF
// PRD §2.1: Attorney can explicitly grant a Staff member
// content access to documents on a specific case.
// ─────────────────────────────────────────────────────────────
export async function grantDocumentAccess(caseId: string, staffUserId: string) {
  const { supabase, profile } = await requireFirmMember()

  // Only attorneys can grant access
  if (profile.role !== 'attorney') {
    throw new Error('Only attorneys can grant document access to staff')
  }

  // Verify the staff member exists and has role='staff' in the same firm
  const { data: staffProfile } = await supabase
    .from('user_profile')
    .select('id, role')
    .eq('id', staffUserId)
    .eq('firm_id', profile.firm_id)
    .eq('role', 'staff')
    .single()

  if (!staffProfile) {
    throw new Error('Staff member not found in your firm')
  }

  const { error } = await supabase
    .from('case_document_access')
    .insert({
      case_id: caseId,
      user_id: staffUserId,
      firm_id: profile.firm_id,
      granted_by: profile.id,
    })

  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation — already granted
      return
    }
    throw new Error('Failed to grant document access: ' + error.message)
  }

  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'document_access.granted',
    entityType: 'case_document_access',
    entityId: caseId,
    payload: { staff_user_id: staffUserId },
  })

  revalidatePath(`/cases/${caseId}`)
}

// ─────────────────────────────────────────────────────────────
// REVOKE DOCUMENT ACCESS FROM STAFF
// ─────────────────────────────────────────────────────────────
export async function revokeDocumentAccess(caseId: string, staffUserId: string) {
  const { supabase, profile } = await requireFirmMember()

  // Only attorneys can revoke access
  if (profile.role !== 'attorney') {
    throw new Error('Only attorneys can revoke document access')
  }

  const { error } = await supabase
    .from('case_document_access')
    .delete()
    .eq('case_id', caseId)
    .eq('user_id', staffUserId)
    .eq('firm_id', profile.firm_id)

  if (error) {
    throw new Error('Failed to revoke document access: ' + error.message)
  }

  await writeAuditLog({
    firmId: profile.firm_id,
    actorId: profile.id,
    action: 'document_access.revoked',
    entityType: 'case_document_access',
    entityId: caseId,
    payload: { staff_user_id: staffUserId },
  })

  revalidatePath(`/cases/${caseId}`)
}
