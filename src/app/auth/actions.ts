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

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const firmName = formData.get('firm_name') as string

  if (!email || !password || !fullName || !firmName) {
    redirect('/auth/signup?error=missing_fields')
  }

  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${host}`

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Pass firm name and full name through the email confirmation flow
      data: {
        full_name: fullName,
        firm_name: firmName,
        role: 'firm_admin',
      },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (error) {
    redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/auth/signup?success=check_email')
}

// ─────────────────────────────────────────────────────────────
// STAFF / ADMIN LOGIN
// ─────────────────────────────────────────────────────────────
export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const next     = (formData.get('next') as string) || '/dashboard'

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
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

  // Log in using email + password
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/portal/${slug}/login?error=${encodeURIComponent(error.message)}`)
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

  // Create the user_profile as firm_admin
  const { error: profileError } = await adminSupabase
    .from('user_profile')
    .upsert({
      id:        user.id,
      firm_id:   firm.id,
      full_name: fullName,
      role:      'firm_admin',
    })

  if (profileError) {
    redirect('/auth/onboarding?error=profile_creation_failed')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
