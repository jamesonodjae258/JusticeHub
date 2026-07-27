import { NextRequest, NextResponse } from 'next/server'
import { createClient as createBaseClient } from '@supabase/supabase-js'

/**
 * POST /api/invite/accept
 *
 * Accepts an invitation: creates the auth user, user_profile, and marks
 * the invitation as accepted. All in one atomic-ish flow.
 *
 * Body: { token: string, password: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, password } = body as { token?: string; password?: string }

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const adminSupabase = createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // 1. Look up the invitation
  const { data: invitation, error: fetchErr } = await adminSupabase
    .from('firm_invitations')
    .select('id, email, full_name, role, firm_id, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (fetchErr || !invitation) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  }

  // 2. Check if already accepted (one-time use)
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })
  }

  // 3. Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired. Ask your admin to resend it.' }, { status: 410 })
  }

  // 4. Mark as accepted IMMEDIATELY (before creating user) to prevent race conditions
  const { error: acceptErr } = await adminSupabase
    .from('firm_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .is('accepted_at', null) // Extra guard: only update if still null

  if (acceptErr) {
    return NextResponse.json({ error: 'Failed to accept invitation.' }, { status: 500 })
  }

  // 5. Create the auth user with email confirmed (they verified by clicking the link)
  const { data: authData, error: createErr } = await adminSupabase.auth.admin.createUser({
    email:             invitation.email,
    password,
    email_confirm:     true,
    user_metadata: {
      full_name: invitation.full_name,
      role:      invitation.role,
      firm_id:   invitation.firm_id,
    },
  })

  if (createErr) {
    // If user already exists (e.g. previously created via inviteUserByEmail),
    // try to update their password instead
    if (createErr.message?.includes('already been registered') || createErr.message?.includes('already exists')) {
      // Look up existing user
      const { data: existingUsers } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
      const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === invitation.email.toLowerCase())

      if (existingUser) {
        // Update their password
        const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
        })

        if (updateErr) {
          // Rollback acceptance
          await adminSupabase
            .from('firm_invitations')
            .update({ accepted_at: null })
            .eq('id', invitation.id)
          return NextResponse.json({ error: `Failed to set password: ${updateErr.message}` }, { status: 500 })
        }

        // Create user_profile for the existing auth user
        await adminSupabase
          .from('user_profile')
          .upsert({
            id:        existingUser.id,
            firm_id:   invitation.firm_id,
            full_name: invitation.full_name,
            role:      invitation.role,
            status:    'active',
          })

        return NextResponse.json({ success: true, redirect: '/dashboard' })
      }
    }

    // Rollback acceptance on failure
    await adminSupabase
      .from('firm_invitations')
      .update({ accepted_at: null })
      .eq('id', invitation.id)

    return NextResponse.json({ error: `Failed to create account: ${createErr.message}` }, { status: 500 })
  }

  // 6. Create the user_profile
  const { error: profileErr } = await adminSupabase
    .from('user_profile')
    .upsert({
      id:        authData.user.id,
      firm_id:   invitation.firm_id,
      full_name: invitation.full_name,
      role:      invitation.role,
      status:    'active',
    })

  if (profileErr) {
    console.error('[invite/accept] Failed to create profile:', profileErr.message)
  }

  return NextResponse.json({ success: true, redirect: '/dashboard' })
}
