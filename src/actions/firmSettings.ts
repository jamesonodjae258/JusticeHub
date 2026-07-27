'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'
import type { FirmSettingsRow } from '@/types/database.types'

const SIGNED_URL_TTL = 604800 // 7 days

/** Returns signed URL for firm logo image in private 'firm-logos' bucket */
export async function getSignedLogoUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null

  const adminSupabase = await createAdminClient()
  const { data, error } = await adminSupabase.storage
    .from('firm-logos')
    .createSignedUrl(storagePath, SIGNED_URL_TTL)

  if (error || !data?.signedUrl) {
    console.error('[firmSettings] Error generating signed logo URL:', error?.message)
    return null
  }

  return data.signedUrl
}

/** Helper enforcing firm_admin role */
async function requireFirmAdmin() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'firm_admin') {
    redirect('/dashboard')
  }

  if (profile.status === 'deactivated') {
    redirect('/auth/login')
  }

  return { supabase, user, profile }
}

/** Fetches firm settings for current firm_admin */
export async function getFirmSettings() {
  const { supabase, profile } = await requireFirmAdmin()

  // Get firm name
  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  // Get firm_settings row
  let { data: settings } = await supabase
    .from('firm_settings')
    .select('*')
    .eq('firm_id', profile.firm_id)
    .maybeSingle()

  // Auto-create settings if missing
  if (!settings) {
    const { data: newSettings } = await supabase
      .from('firm_settings')
      .insert({ firm_id: profile.firm_id })
      .select('*')
      .single()
    settings = newSettings
  }

  const logoSignedUrl = settings?.logo_url
    ? await getSignedLogoUrl(settings.logo_url)
    : null

  return {
    firmName: firm?.name ?? '',
    settings: settings ? {
      ...settings,
      logo_signed_url: logoSignedUrl,
    } as FirmSettingsRow : null,
  }
}

/** Updates firm settings (firm_admin only) */
export async function updateFirmSettings(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  const firmName        = (formData.get('firm_name') as string)?.trim()
  const address         = (formData.get('address') as string)?.trim() || null
  const primaryEmail    = (formData.get('primary_email') as string)?.trim() || null
  const phone           = (formData.get('phone') as string)?.trim() || null
  const websiteUrl      = (formData.get('website_url') as string)?.trim() || null
  const logoFile        = formData.get('logo_file') as File | null

  // Billing defaults
  const defaultRate     = parseFloat((formData.get('default_hourly_rate') as string) || '0')
  const paymentTerms    = (formData.get('default_payment_terms') as string)?.trim() || 'Payment due within 14 days'
  const currency        = (formData.get('invoice_currency') as string) || 'NGN'
  const prefix          = (formData.get('invoice_prefix') as string)?.trim() || 'INV-2026-'
  const taxLabel        = (formData.get('tax_label') as string)?.trim() || null
  const taxRate         = parseFloat((formData.get('tax_rate') as string) || '0')
  const bankDetails     = (formData.get('bank_details') as string)?.trim() || null

  // Client Portal Settings
  const portalHeaderMsg = (formData.get('portal_header_message') as string)?.trim() || null
  const allowDocDownload = formData.get('allow_client_doc_download') === 'true'
  const showPhoneDefault = formData.get('show_attorney_phone_by_default') === 'true'

  // Security
  const enforce2fa     = formData.get('enforce_2fa') === 'true'
  const sessionTimeout = (formData.get('session_timeout') as string) || '24h'

  if (!firmName) {
    return { success: false, error: 'Firm name is required.' }
  }

  if (portalHeaderMsg && portalHeaderMsg.length > 200) {
    return { success: false, error: 'Portal header message must be 200 characters or fewer.' }
  }

  let logoStoragePath: string | undefined = undefined

  // Upload logo file if provided
  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Logo image must be under 5MB.' }
    }

    const ext = logoFile.name.split('.').pop() || 'png'
    const filePath = `${profile.firm_id}/logo-${Date.now()}.${ext}`

    const arrayBuffer = await logoFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadErr } = await adminSupabase.storage
      .from('firm-logos')
      .upload(filePath, buffer, {
        contentType: logoFile.type || 'image/png',
        upsert: true,
      })

    if (uploadErr) {
      return { success: false, error: `Logo upload failed: ${uploadErr.message}` }
    }

    logoStoragePath = filePath
  }

  // Update firm name in firm table
  await supabase
    .from('firm')
    .update({ name: firmName })
    .eq('id', profile.firm_id)

  // Build payload for firm_settings update
  const payload: Record<string, unknown> = {
    address:                        address,
    primary_email:                  primaryEmail,
    phone:                          phone,
    website_url:                    websiteUrl,
    default_hourly_rate:            isNaN(defaultRate) ? 0 : defaultRate,
    default_payment_terms:          paymentTerms,
    invoice_currency:               currency,
    invoice_prefix:                 prefix,
    tax_label:                      taxLabel,
    tax_rate:                       isNaN(taxRate) ? 0 : taxRate,
    bank_details:                   bankDetails,
    portal_header_message:          portalHeaderMsg,
    allow_client_doc_download:      allowDocDownload,
    show_attorney_phone_by_default: showPhoneDefault,
    enforce_2fa:                    enforce2fa,
    session_timeout:                sessionTimeout,
    updated_at:                     new Date().toISOString(),
  }

  if (logoStoragePath !== undefined) {
    payload.logo_url = logoStoragePath
  }

  const { error: updateErr } = await supabase
    .from('firm_settings')
    .upsert({
      firm_id: profile.firm_id,
      ...payload,
    })

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'firm_settings.updated',
    entityType: 'firm_settings',
    entityId:   profile.firm_id,
    payload:    { firm_name: firmName },
  })

  revalidatePath('/settings/firm')
  revalidatePath('/', 'layout')

  return { success: true }
}

/** Fetches login activity for all members of the firm (Security tab) */
export async function getMemberLoginActivity() {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  // Fetch profiles
  const { data: members } = await supabase
    .from('user_profile')
    .select('id, full_name, role, status')
    .eq('firm_id', profile.firm_id)

  const memberIds = members?.map(m => m.id) ?? []
  if (memberIds.length === 0) return []

  const { data: authUsers } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })

  const authUserMap = new Map(authUsers?.users?.map(u => [u.id, u]) ?? [])

  return (members ?? []).map(m => {
    const au = authUserMap.get(m.id)
    return {
      id:              m.id,
      full_name:       m.full_name,
      role:            m.role,
      status:          m.status,
      email:           au?.email ?? '—',
      last_sign_in_at: au?.last_sign_in_at ?? null,
      created_at:      au?.created_at ?? null,
    }
  })
}
