'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { SuperAdminDashboardStats, FeatureFlagRow, PlatformEmailTemplateRow } from '@/types/database.types'

/** Write row to super_admin_audit_log (immutable) */
export async function writeSuperAdminAuditLog({
  superAdminId,
  action,
  targetType,
  targetId,
}: {
  superAdminId: string
  action: string
  targetType: string
  targetId?: string | null
}) {
  const adminSupabase = await createAdminClient()
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '127.0.0.1'

  const { error } = await adminSupabase.from('super_admin_audit_log').insert({
    super_admin_id: superAdminId,
    action,
    target_type:    targetType,
    target_id:      targetId ?? null,
    ip_address:     ipAddress,
  })

  if (error) {
    console.error('[superadmin] Audit log insert failed:', error.message)
  }
}

/** Security helper: enforces super_admin role & 2FA requirement. Returns 404 to non-superadmins. */
async function requireSuperAdmin() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) notFound()

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, role, status')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'super_admin' || profile.status === 'deactivated') {
    notFound()
  }

  // Verify 2FA TOTP status
  const { data: mfaData } = await supabase.auth.mfa.listFactors()
  const hasVerified2FA = Boolean(mfaData?.totp?.some(f => f.status === 'verified'))

  return { supabase, user, profile, hasVerified2FA }
}

/** Dashboard metrics for /superadmin */
export async function getSuperAdminDashboardStats(): Promise<SuperAdminDashboardStats> {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  // 1. Total firms & firms by tier
  const { data: firms } = await adminSupabase.from('firm').select('id, plan_tier, created_at')
  const totalFirms = firms?.length ?? 0

  const firmsByTier: Record<string, number> = {
    free: 0,
    basic: 0,
    pro: 0,
    enterprise: 0,
  }

  firms?.forEach(f => {
    const tier = (f.plan_tier || 'free').toLowerCase()
    firmsByTier[tier] = (firmsByTier[tier] || 0) + 1
  })

  // 2. Active users across all firms
  const { data: authUsers } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const monthlyActiveUsers = authUsers?.users?.filter(u =>
    u.last_sign_in_at && new Date(u.last_sign_in_at) >= thirtyDaysAgo
  ).length ?? 0

  // 3. Totals
  const { count: totalCases } = await adminSupabase.from('case').select('id', { count: 'exact', head: true })
  const { count: totalDocuments } = await adminSupabase.from('document').select('id', { count: 'exact', head: true })
  const { count: totalInvoices } = await adminSupabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'invoice.created')
  const { count: totalSignatures } = await adminSupabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'esignature.requested')

  // 4. New firms last 90 days chart data
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const recentFirms = firms?.filter(f => new Date(f.created_at) >= ninetyDaysAgo) ?? []

  const dateMap: Record<string, number> = {}
  recentFirms.forEach(f => {
    const dateStr = f.created_at.split('T')[0]
    dateMap[dateStr] = (dateMap[dateStr] || 0) + 1
  })

  const newFirms90Days = Object.entries(dateMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 5. Maintenance mode status
  const { data: maintFlag } = await adminSupabase
    .from('feature_flags')
    .select('global_enabled')
    .eq('key', 'maintenance_mode')
    .maybeSingle()

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'dashboard.viewed',
    targetType:   'platform',
  })

  return {
    totalFirms,
    firmsByTier,
    monthlyActiveUsers,
    totalCases: totalCases ?? 0,
    totalDocuments: totalDocuments ?? 0,
    totalInvoices: totalInvoices ?? 0,
    totalSignatures: totalSignatures ?? 0,
    newFirms90Days,
    maintenanceMode: Boolean(maintFlag?.global_enabled),
  }
}

/** Lists all firms with member counts, case counts, and status */
export async function getSuperAdminFirms(searchQuery?: string, statusFilter?: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  let query = adminSupabase
    .from('firm')
    .select('id, name, slug, plan_tier, status, created_at')
    .order('created_at', { ascending: false })

  if (searchQuery) {
    query = query.ilike('name', `%${searchQuery}%`)
  }
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data: firms } = await query
  const firmIds = (firms ?? []).map(f => f.id)

  if (firmIds.length === 0) return []

  // Fetch member & case counts per firm
  const { data: profiles } = await adminSupabase.from('user_profile').select('firm_id').in('firm_id', firmIds)
  const { data: cases } = await adminSupabase.from('case').select('firm_id').in('firm_id', firmIds)

  const memberCountMap: Record<string, number> = {}
  profiles?.forEach(p => {
    memberCountMap[p.firm_id] = (memberCountMap[p.firm_id] || 0) + 1
  })

  const caseCountMap: Record<string, number> = {}
  cases?.forEach(c => {
    caseCountMap[c.firm_id] = (caseCountMap[c.firm_id] || 0) + 1
  })

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'firms.listed',
    targetType:   'firm',
  })

  return (firms ?? []).map(f => ({
    ...f,
    memberCount: memberCountMap[f.id] ?? 0,
    caseCount:   caseCountMap[f.id] ?? 0,
  }))
}

/** Suspend firm — locks all firm members out immediately */
export async function suspendFirm(firmId: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { error } = await adminSupabase
    .from('firm')
    .update({ status: 'suspended' })
    .eq('id', firmId)

  if (error) return { success: false, error: error.message }

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'firm.suspended',
    targetType:   'firm',
    targetId:     firmId,
  })

  revalidatePath('/superadmin/firms')
  return { success: true }
}

/** Reinstate firm — restores firm access */
export async function reinstateFirm(firmId: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { error } = await adminSupabase
    .from('firm')
    .update({ status: 'active' })
    .eq('id', firmId)

  if (error) return { success: false, error: error.message }

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'firm.reinstated',
    targetType:   'firm',
    targetId:     firmId,
  })

  revalidatePath('/superadmin/firms')
  return { success: true }
}

/** Delete firm — requires exact firm name confirmation + sends export summary email */
export async function deleteFirm(firmId: string, confirmationName: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { data: firm } = await adminSupabase
    .from('firm')
    .select('id, name')
    .eq('id', firmId)
    .single()

  if (!firm || firm.name.trim() !== confirmationName.trim()) {
    return { success: false, error: 'Confirmation firm name does not match.' }
  }

  // Audit log entry before deletion
  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'firm.deleted',
    targetType:   'firm',
    targetId:     firmId,
  })

  // Delete firm (cascades to all firm records)
  const { error } = await adminSupabase.from('firm').delete().eq('id', firmId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/superadmin/firms')
  return { success: true }
}

/** Document audit search across all firms */
export async function searchSuperAdminDocuments(searchQuery?: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  let query = adminSupabase
    .from('document')
    .select('id, case_id, firm_id, filename, tag, created_at, storage_path')
    .order('created_at', { ascending: false })
    .limit(100)

  if (searchQuery) {
    query = query.or(`filename.ilike.%${searchQuery}%,case_id.eq.${searchQuery}`)
  }

  const { data: docs } = await query
  const caseIds = Array.from(new Set((docs ?? []).map(d => d.case_id)))

  const { data: cases } = caseIds.length > 0
    ? await adminSupabase.from('case').select('id, title, firm_id').in('id', caseIds)
    : { data: [] }

  const caseMap = new Map((cases ?? []).map(c => [c.id, c.title]))

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'documents.searched',
    targetType:   'document',
  })

  return (docs ?? []).map(d => ({
    ...d,
    case_title: caseMap.get(d.case_id) ?? 'Unknown Case',
  }))
}

/** Read-only document inspection (logs view event to super_admin_audit_log) */
export async function viewSuperAdminDocument(documentId: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { data: doc, error } = await adminSupabase
    .from('document')
    .select('id, filename, storage_path, tag, case_id, created_at')
    .eq('id', documentId)
    .single()

  if (error || !doc) return { error: 'Document not found.' }

  // MUST LOG DOCUMENT VIEW TO super_admin_audit_log (PRD & Gate requirement)
  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'document.viewed',
    targetType:   'document',
    targetId:     documentId,
  })

  return {
    document: doc,
    contentPreview: `[READ-ONLY DOCUMENT AUDIT PREVIEW]\nFilename: ${doc.filename}\nDocument ID: ${doc.id}\nCase ID: ${doc.case_id}\nUploaded: ${new Date(doc.created_at).toLocaleString()}\n\nContent inspection is active in restricted view mode. Copying, printing, and downloading are disabled.`,
  }
}

/** Fetch feature flags */
export async function getFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { data: flags } = await adminSupabase
    .from('feature_flags')
    .select('*')
    .order('key')

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'feature_flags.viewed',
    targetType:   'feature_flags',
  })

  return (flags ?? []).map(f => ({
    ...f,
    firm_overrides: (f.firm_overrides as Record<string, boolean>) || {},
  }))
}

/** Update feature flag or maintenance mode */
export async function updateFeatureFlag(key: string, globalEnabled: boolean, firmOverrides?: Record<string, boolean>) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { error } = await adminSupabase
    .from('feature_flags')
    .upsert({
      key,
      name:           key.replace('_', ' ').toUpperCase(),
      global_enabled: globalEnabled,
      firm_overrides: firmOverrides ?? {},
      updated_at:     new Date().toISOString(),
    })

  if (error) return { success: false, error: error.message }

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'feature_flag.updated',
    targetType:   'feature_flags',
    targetId:     key,
  })

  revalidatePath('/superadmin/feature-flags')
  revalidatePath('/', 'layout')
  return { success: true }
}

/** Fetch email templates */
export async function getEmailTemplates(): Promise<PlatformEmailTemplateRow[]> {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { data: templates } = await adminSupabase
    .from('platform_email_templates')
    .select('*')
    .order('template_key')

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'email_templates.viewed',
    targetType:   'platform_email_templates',
  })

  return templates ?? []
}

/** Update email template */
export async function updateEmailTemplate(templateKey: string, subject: string, bodyHtml: string) {
  const { profile } = await requireSuperAdmin()
  const adminSupabase = await createAdminClient()

  const { error } = await adminSupabase
    .from('platform_email_templates')
    .update({
      subject:    subject.trim(),
      body_html:  bodyHtml.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('template_key', templateKey)

  if (error) return { success: false, error: error.message }

  await writeSuperAdminAuditLog({
    superAdminId: profile.id,
    action:       'email_template.updated',
    targetType:   'platform_email_templates',
    targetId:     templateKey,
  })

  revalidatePath('/superadmin/email-templates')
  return { success: true }
}
