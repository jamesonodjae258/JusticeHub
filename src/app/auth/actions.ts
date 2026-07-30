'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateUniqueSlug } from '@/lib/slug'

// ─────────────────────────────────────────────────────────────
// STAFF SIGNUP
// Creates a Supabase auth user, then (on email confirmation)
// creates the firm + user_profile rows via the confirm callback.
// The actual firm creation happens in /auth/confirm.
// ─────────────────────────────────────────────────────────────
export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const firmName = formData.get('firm_name') as string

  if (!email || !password || !fullName || !firmName) {
    redirect('/auth/signup?error=missing_fields')
  }

  try {
    // 1. Create auth user (email confirmation is disabled)
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          firm_name: firmName,
          role: 'super_admin',
        },
      },
    })

    if (error) {
      const msg = error.message.toLowerCase().includes('fetch failed')
        ? 'Unable to connect to Supabase authentication service. Please verify network or Vercel environment variables (NEXT_PUBLIC_SUPABASE_URL).'
        : error.message
      redirect(`/auth/signup?error=${encodeURIComponent(msg)}`)
    }

    if (!authData.user) {
      redirect('/auth/signup?error=account_creation_failed')
    }

    // 2. Sign in immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      redirect(`/auth/signup?error=${encodeURIComponent(signInError.message)}`)
    }

    // 3. Create firm
    const slug = await generateUniqueSlug(firmName)
    const { data: firm, error: firmError } = await adminSupabase
      .from('firm')
      .insert({ name: firmName, slug, status: 'active' })
      .select('id')
      .single()

    if (firmError || !firm) {
      redirect(`/auth/signup?error=${encodeURIComponent('Failed to create firm: ' + (firmError?.message || 'Unknown error'))}`)
    }

    // 4. Create user_profile as super_admin
    const { error: profileError } = await adminSupabase
      .from('user_profile')
      .upsert({
        id:        authData.user.id,
        firm_id:   firm.id,
        full_name: fullName,
        role:      'super_admin',
        status:    'active',
      })

    if (profileError) {
      redirect(`/auth/signup?error=${encodeURIComponent('Failed to create profile: ' + profileError.message)}`)
    }

    // 5. Create default firm_settings
    await adminSupabase.from('firm_settings').upsert({
      firm_id:          firm.id,
      contact_email:    email,
      invoice_currency: 'NGN',
      payment_terms:    'Payment due within 14 days',
    })

  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    const msg = err?.message?.toLowerCase().includes('fetch failed')
      ? 'Unable to connect to Supabase authentication service. Please verify network or Vercel environment variables (NEXT_PUBLIC_SUPABASE_URL).'
      : (err?.message || 'Failed to sign up')
    redirect(`/auth/signup?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard/overview')
}

async function recordLoginAudit(userId: string | null, firmId: string | null, success: boolean) {
  try {
    const adminSupabase = await createAdminClient()
    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '127.0.0.1'
    const userAgent = headersList.get('user-agent') || 'Unknown User-Agent'
    const device = userAgent.includes('Mobile') ? 'Mobile Device' : (userAgent.includes('Mac') ? 'Macintosh' : 'Windows PC')

    await adminSupabase.from('login_audit').insert({
      user_id:    userId,
      firm_id:    firmId,
      ip_address: ipAddress,
      device:     device,
      user_agent: userAgent,
      success:    success,
    })
  } catch (err) {
    console.error('[login_audit] Failed to write entry:', err)
  }
}

// ─────────────────────────────────────────────────────────────
// STAFF / ADMIN LOGIN
// ─────────────────────────────────────────────────────────────
export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const next     = (formData.get('next') as string) || '/dashboard'

  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      await recordLoginAudit(null, null, false)
      const msg = error.message.toLowerCase().includes('fetch failed')
        ? 'Unable to connect to Supabase authentication service. Please verify network or Vercel environment variables (NEXT_PUBLIC_SUPABASE_URL).'
        : error.message
      redirect(`/auth/login?error=${encodeURIComponent(msg)}`)
    }

    if (authData.user) {
      const { data: profile } = await supabase
        .from('user_profile')
        .select('firm_id')
        .eq('id', authData.user.id)
        .maybeSingle()

      await recordLoginAudit(authData.user.id, profile?.firm_id ?? null, true)
    }
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    await recordLoginAudit(null, null, false)
    const msg = err?.message?.toLowerCase().includes('fetch failed')
      ? 'Unable to connect to Supabase authentication service. Please verify network or Vercel environment variables (NEXT_PUBLIC_SUPABASE_URL).'
      : (err?.message || 'Failed to sign in')
    redirect(`/auth/login?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

// ─────────────────────────────────────────────────────────────
// SIGN OUT
// ─────────────────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}

// ─────────────────────────────────────────────────────────────
// CLIENT PORTAL LOGIN (magic link / OTP)
// Clients can sign in with email+password (if set during invite) or get a magic link.
// ─────────────────────────────────────────────────────────────
export async function clientSignIn(formData: FormData) {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const email    = formData.get('email') as string
  const password = (formData.get('password') as string)?.trim()
  const slug     = formData.get('slug') as string

  if (!email || !slug || !password) {
    redirect(`/portal/${slug}/login?error=missing_fields`)
  }

  // 1. Verify that the firm exists with this slug
  const { data: firm } = await adminSupabase
    .from('firm')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!firm) {
    redirect(`/auth/client-login?error=invalid_firm`)
  }

  // 2. Verify that the client email belongs to this specific firm
  const { data: clientRecord } = await adminSupabase
    .from('client')
    .select('id')
    .eq('firm_id', firm.id)
    .eq('email', email)
    .maybeSingle()

  if (!clientRecord) {
    redirect(`/portal/${slug}/login?error=no_portal_access`)
  }

  try {
    // Log in using email + password
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      await recordLoginAudit(null, firm.id, false)
      const msg = error.message.toLowerCase().includes('fetch failed')
        ? 'Unable to connect to Supabase authentication service. Please check network/Vercel environment variables.'
        : error.message
      redirect(`/portal/${slug}/login?error=${encodeURIComponent(msg)}`)
    }

    if (authData.user) {
      await recordLoginAudit(authData.user.id, firm.id, true)
    }
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    await recordLoginAudit(null, firm.id, false)
    const msg = err?.message?.toLowerCase().includes('fetch failed')
      ? 'Unable to connect to Supabase authentication service. Please check network/Vercel environment variables.'
      : (err?.message || 'Login failed')
    redirect(`/portal/${slug}/login?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/portal')
}

// ─────────────────────────────────────────────────────────────
// SEND CLIENT OTP CODE
// Triggers Supabase to send a 6-digit verification code to the client.
// ─────────────────────────────────────────────────────────────
export async function sendClientOtp(email: string, slug: string) {
  const adminSupabase = await createAdminClient()

  // 1. Verify that the firm exists with this slug
  const { data: firm } = await adminSupabase
    .from('firm')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!firm) {
    return { error: 'Firm portal not found' }
  }

  // 2. Verify that the client email belongs to this specific firm
  const { data: clientRecord } = await adminSupabase
    .from('client')
    .select('id')
    .eq('firm_id', firm.id)
    .eq('email', email)
    .maybeSingle()

  if (!clientRecord) {
    return { error: 'No portal access found for this email under this firm' }
  }

  // 3. Send Supabase OTP code
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // Clients must already be invited
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// VERIFY CLIENT OTP CODE
// Verifies the 6-digit OTP code entered by the client.
// ─────────────────────────────────────────────────────────────
export async function verifyClientOtp(email: string, token: string, slug: string) {
  const supabase = await createClient()

  // Verify the code (attempt type 'email' first, then 'magiclink' as fallback)
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    const { error: fbError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'magiclink',
    })

    if (fbError) {
      return { error: fbError.message }
    }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// INVITE CLIENT (called by staff)
// Uses service role to invoke Supabase Admin API.
// Links the resulting auth user to the client record.
// ─────────────────────────────────────────────────────────────
export async function inviteClient(clientId: string, clientEmail: string, clientName: string) {
  const supabase      = await createClient()
  const adminSupabase = await createAdminClient()

  // Verify the caller is authenticated staff
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, firm_id, status')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'attorney') {
    throw new Error('Only attorneys can invite clients to the portal')
  }

  if (profile.status === 'deactivated') {
    throw new Error('Account deactivated')
  }

  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  // Send the invite via Supabase Admin API
  const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    clientEmail,
    {
      redirectTo: `${siteUrl}/auth/confirm`,
      data: {
        client_id: clientId,
        firm_id:   profile.firm_id,
        full_name: clientName,
        role:      'client',
      },
    }
  )

  if (inviteError) throw inviteError

  // Mark the client record as having portal access
  await supabase
    .from('client')
    .update({ portal_access: true })
    .eq('id', clientId)
    .eq('firm_id', profile.firm_id)

  return { success: true, userId: inviteData.user?.id }
}

// ─────────────────────────────────────────────────────────────
// COMPLETE ONBOARDING
// Creates the firm and user profile for a newly signed-up OAuth user.
// ─────────────────────────────────────────────────────────────
export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  // Get current authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/auth/login?error=not_authenticated')
  }

  const firmName = formData.get('firm_name') as string
  const fullName = formData.get('full_name') as string

  if (!firmName || !fullName) {
    redirect('/auth/onboarding?error=missing_fields')
  }

  // Generate unique slug for the firm
  const slug = await generateUniqueSlug(firmName)

  // Create the firm
  const { data: firm, error: firmError } = await adminSupabase
    .from('firm')
    .insert({ name: firmName, slug })
    .select('id')
    .single()

  if (firmError || !firm) {
    redirect('/auth/onboarding?error=firm_creation_failed')
  }

  // Create the user_profile as super_admin
  const { error: profileError } = await adminSupabase
    .from('user_profile')
    .upsert({
      id:        user.id,
      firm_id:   firm.id,
      full_name: fullName,
      role:      'super_admin',
    })

  if (profileError) {
    redirect('/auth/onboarding?error=profile_creation_failed')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard/overview')
}
