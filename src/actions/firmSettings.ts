'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface FirmSettingsData {
  firm_id: string
  firm_name: string
  address: string | null
  contact_email: string | null
  phone: string | null
  website: string | null
  logo_url: string | null
  logo_signed_url: string | null
  invoice_currency: string
  invoice_number_format: string
  tax_label: string | null
  tax_rate: number
  payment_terms: string | null
  bank_details: string | null
  portal_message: string | null
  allow_client_download: boolean
  show_attorney_phone: boolean
  enforce_2fa: boolean
  session_timeout_minutes: number
}

/** Get firm settings for current user */
export async function getFirmSettings(): Promise<FirmSettingsData | null> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role, firm:firm_id(name)')
    .eq('id', user.id)
    .single()

  if (!userProfile?.firm_id) return null

  const { data: settings } = await adminSupabase
    .from('firm_settings')
    .select('*')
    .eq('firm_id', userProfile.firm_id)
    .maybeSingle()

  let logoSignedUrl: string | null = null
  if (settings?.logo_url) {
    try {
      const { data } = await adminSupabase.storage
        .from('firm-logos')
        .createSignedUrl(settings.logo_url, 604800)
      if (data?.signedUrl) logoSignedUrl = data.signedUrl
    } catch (err) {
      console.error('Failed to create logo signed URL:', err)
    }
  }

  return {
    firm_id:                 userProfile.firm_id,
    firm_name:               (userProfile.firm as any)?.name ?? 'Law Firm',
    address:                 settings?.address || null,
    contact_email:           settings?.contact_email || null,
    phone:                   settings?.phone || null,
    website:                 settings?.website || null,
    logo_url:                settings?.logo_url || null,
    logo_signed_url:         logoSignedUrl,
    invoice_currency:        settings?.invoice_currency || 'NGN',
    invoice_number_format:   settings?.invoice_number_format || 'INV-2026-001',
    tax_label:               settings?.tax_label || 'VAT 7.5%',
    tax_rate:                settings?.tax_rate || 7.5,
    payment_terms:           settings?.payment_terms || 'Payment due within 14 days',
    bank_details:            settings?.bank_details || null,
    portal_message:          settings?.portal_message || null,
    allow_client_download:   settings?.allow_client_download ?? true,
    show_attorney_phone:     settings?.show_attorney_phone ?? false,
    enforce_2fa:             settings?.enforce_2fa ?? false,
    session_timeout_minutes: settings?.session_timeout_minutes || 240,
  }
}

/** Update Firm Profile (Name, Address, Contact, Logo) */
export async function updateFirmProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin'].includes(userProfile.role)) {
    return { success: false, error: 'Only Firm Admins and Super Admins can update firm settings.' }
  }

  const firmName     = (formData.get('firm_name') as string)?.trim()
  const address      = (formData.get('address') as string)?.trim()
  const contactEmail = (formData.get('contact_email') as string)?.trim()
  const phone        = (formData.get('phone') as string)?.trim()
  const website      = (formData.get('website') as string)?.trim()
  const logoFile     = formData.get('logo') as File | null

  if (firmName) {
    await adminSupabase.from('firm').update({ name: firmName }).eq('id', userProfile.firm_id)
  }

  let logoPath: string | null = null
  if (logoFile && logoFile.size > 0) {
    const fileExt = logoFile.name.split('.').pop() || 'png'
    const storagePath = `${userProfile.firm_id}/logo-${Date.now()}.${fileExt}`

    const { error: uploadErr } = await adminSupabase.storage
      .from('firm-logos')
      .upload(storagePath, logoFile, { contentType: logoFile.type, upsert: true })

    if (!uploadErr) logoPath = storagePath
  }

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (address !== undefined) payload.address = address || null
  if (contactEmail !== undefined) payload.contact_email = contactEmail || null
  if (phone !== undefined) payload.phone = phone || null
  if (website !== undefined) payload.website = website || null
  if (logoPath) payload.logo_url = logoPath

  const { error } = await adminSupabase
    .from('firm_settings')
    .upsert({
      firm_id: userProfile.firm_id,
      ...payload,
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/firm')
  revalidatePath('/settings/firm-admin')
  return { success: true }
}

/** Update Billing Defaults (SUPER ADMIN ONLY) */
export async function updateBillingDefaults(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (userProfile?.role !== 'super_admin') {
    return { success: false, error: 'Only Super Admins can update billing defaults.' }
  }

  const currency     = (formData.get('invoice_currency') as string) || 'NGN'
  const numberFormat = (formData.get('invoice_number_format') as string)?.trim() || 'INV-2026-001'
  const taxLabel     = (formData.get('tax_label') as string)?.trim() || 'VAT 7.5%'
  const taxRateStr   = formData.get('tax_rate') as string
  const paymentTerms = (formData.get('payment_terms') as string)?.trim()
  const bankDetails  = (formData.get('bank_details') as string)?.trim()

  const { error } = await adminSupabase
    .from('firm_settings')
    .upsert({
      firm_id:               userProfile.firm_id,
      invoice_currency:      currency,
      invoice_number_format: numberFormat,
      tax_label:             taxLabel,
      tax_rate:              parseFloat(taxRateStr) || 7.5,
      payment_terms:         paymentTerms || null,
      bank_details:          bankDetails || null,
      updated_at:            new Date().toISOString(),
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/firm')
  return { success: true }
}

/** Update Client Portal Settings */
export async function updatePortalSettings(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin'].includes(userProfile.role)) {
    return { success: false, error: 'Unauthorized' }
  }

  const portalMsg    = (formData.get('portal_message') as string)?.trim()
  const allowDownload = formData.get('allow_client_download') === 'on' || formData.get('allow_client_download') === 'true'
  const showPhone     = formData.get('show_attorney_phone') === 'on' || formData.get('show_attorney_phone') === 'true'

  if (portalMsg && portalMsg.length > 200) {
    return { success: false, error: 'Portal header message must not exceed 200 characters.' }
  }

  const { error } = await adminSupabase
    .from('firm_settings')
    .upsert({
      firm_id:               userProfile.firm_id,
      portal_message:        portalMsg || null,
      allow_client_download: allowDownload,
      show_attorney_phone:   showPhone,
      updated_at:            new Date().toISOString(),
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/firm')
  revalidatePath('/settings/firm-admin')
  return { success: true }
}

/** Update Security Settings */
export async function updateSecuritySettings(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin'].includes(userProfile.role)) {
    return { success: false, error: 'Unauthorized' }
  }

  const enforce2FA = formData.get('enforce_2fa') === 'on' || formData.get('enforce_2fa') === 'true'
  const sessionTimeoutStr = formData.get('session_timeout_minutes') as string

  const payload: Record<string, any> = {
    session_timeout_minutes: parseInt(sessionTimeoutStr) || 240,
    updated_at: new Date().toISOString(),
  }

  if (userProfile.role === 'super_admin') {
    payload.enforce_2fa = enforce2FA
  }

  const { error } = await adminSupabase
    .from('firm_settings')
    .upsert({
      firm_id: userProfile.firm_id,
      ...payload,
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/firm')
  revalidatePath('/settings/firm-admin')
  return { success: true }
}

/** Legacy alias for updateFirmProfile */
export async function updateFirmSettings(formData: FormData): Promise<{ success: boolean; error?: string }> {
  return await updateFirmProfile(formData)
}
