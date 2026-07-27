'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateUniqueSlug } from '@/lib/slug'

/**
 * Step 1: Create Auth User, Firm, User Profile (role = super_admin), Profiles, and Firm Settings.
 */
export async function createOnboardingAccount(formData: FormData): Promise<{ success: boolean; error?: string; firmId?: string }> {
  const email    = (formData.get('email') as string)?.trim()
  const password = (formData.get('password') as string)?.trim()
  const fullName = (formData.get('full_name') as string)?.trim()
  const firmName = (formData.get('firm_name') as string)?.trim() || 'My Law Firm'

  if (!email || !password || !fullName) {
    return { success: false, error: 'Please fill in all required fields (email, password, full name).' }
  }

  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  // 1. Create Supabase Auth User
  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        firm_name: firmName,
        role: 'super_admin',
      },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (signUpError || !authData.user) {
    return { success: false, error: signUpError?.message || 'Failed to create user account.' }
  }

  const userId = authData.user.id

  // 2. Generate unique slug and create Firm
  const slug = await generateUniqueSlug(firmName)
  const { data: firm, error: firmErr } = await adminSupabase
    .from('firm')
    .insert({ name: firmName, slug, status: 'active' })
    .select('id')
    .single()

  if (firmErr || !firm) {
    return { success: false, error: 'Failed to create firm: ' + firmErr?.message }
  }

  // 3. Create user_profile as super_admin
  const { error: profileErr } = await adminSupabase
    .from('user_profile')
    .upsert({
      id:        userId,
      firm_id:   firm.id,
      full_name: fullName,
      role:      'super_admin',
      status:    'active',
    })

  if (profileErr) {
    return { success: false, error: 'Failed to create user profile: ' + profileErr.message }
  }

  // 4. Create profiles row
  await adminSupabase.from('profiles').upsert({
    user_id:               userId,
    firm_id:               firm.id,
    display_name:          fullName,
    hourly_rate:           0,
    show_phone_to_clients: false,
    practice_areas:        [],
  })

  // 5. Create default firm_settings row
  await adminSupabase.from('firm_settings').upsert({
    firm_id:               firm.id,
    primary_email:         email,
    invoice_currency:      'NGN',
    default_payment_terms: 'Payment due within 14 days',
    invoice_prefix:        'INV-',
    next_invoice_number:   1,
  })

  // Authenticate session if unconfirmed email setup allowed
  await supabase.auth.signInWithPassword({ email, password })

  revalidatePath('/', 'layout')
  return { success: true, firmId: firm.id }
}

/**
 * Step 2 Sub-step A: Update Firm Name, Address, and Logo
 */
export async function saveOnboardingFirmInfo(firmId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const adminSupabase = await createAdminClient()

  const firmName = (formData.get('firm_name') as string)?.trim()
  const address  = (formData.get('address') as string)?.trim()
  const logoFile = formData.get('logo') as File | null

  if (firmName) {
    await adminSupabase.from('firm').update({ name: firmName }).eq('id', firmId)
  }

  let logoUrl: string | null = null
  if (logoFile && logoFile.size > 0) {
    const fileExt = logoFile.name.split('.').pop() || 'png'
    const storagePath = `${firmId}/logo-${Date.now()}.${fileExt}`

    const { error: uploadErr } = await adminSupabase.storage
      .from('firm-logos')
      .upload(storagePath, logoFile, { contentType: logoFile.type, upsert: true })

    if (!uploadErr) {
      logoUrl = storagePath
    }
  }

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (address) updateData.address = address
  if (logoUrl) updateData.logo_url = logoUrl

  const { error } = await adminSupabase
    .from('firm_settings')
    .update(updateData)
    .eq('firm_id', firmId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Step 2 Sub-step B: Update Firm Contact Details
 */
export async function saveOnboardingFirmContact(firmId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const adminSupabase = await createAdminClient()

  const primaryEmail = (formData.get('primary_email') as string)?.trim()
  const phone        = (formData.get('phone') as string)?.trim()
  const websiteUrl   = (formData.get('website_url') as string)?.trim()

  const { error } = await adminSupabase
    .from('firm_settings')
    .update({
      primary_email: primaryEmail || null,
      phone:         phone || null,
      website_url:   websiteUrl || null,
      updated_at:    new Date().toISOString(),
    })
    .eq('firm_id', firmId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Step 2 Sub-step C: Update Firm Billing Defaults & Bank Details
 */
export async function saveOnboardingBillingDefaults(firmId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const adminSupabase = await createAdminClient()

  const currency     = (formData.get('invoice_currency') as string) || 'NGN'
  const paymentTerms = (formData.get('default_payment_terms') as string)?.trim() || 'Payment due within 14 days'
  const bankDetails  = (formData.get('bank_details') as string)?.trim()

  const { error } = await adminSupabase
    .from('firm_settings')
    .update({
      invoice_currency:      currency,
      default_payment_terms: paymentTerms,
      bank_details:          bankDetails || null,
      updated_at:            new Date().toISOString(),
    })
    .eq('firm_id', firmId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Step 3: Invite Team Member during onboarding
 */
export async function inviteOnboardingMember(firmId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const name  = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const role  = (formData.get('role') as string) || 'attorney'

  if (!email || !name) return { success: false, error: 'Name and email are required.' }

  const adminSupabase = await createAdminClient()

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error } = await adminSupabase.from('firm_invitations').insert({
    firm_id:    firmId,
    email:      email,
    role:       role,
    token:      token,
    expires_at: expiresAt,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}
