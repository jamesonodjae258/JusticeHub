'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface CreateInviteParams {
  email: string
  role: 'firm_admin' | 'attorney' | 'staff'
  name: string
}

/** Requires caller to be super_admin or firm_admin */
async function requireAdminUser() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'deactivated') {
    throw new Error('Account deactivated')
  }

  if (!['super_admin', 'firm_admin'].includes(profile.role)) {
    throw new Error('Only Super Admin and Firm Admin can invite team members')
  }

  return { supabase, user, profile }
}

/** Create a team invitation with role-based restrictions */
export async function createTeamInvitation({ email, role, name }: CreateInviteParams): Promise<{ success: boolean; error?: string }> {
  const { user, profile } = await requireAdminUser()
  const adminSupabase = await createAdminClient()

  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name.trim()

  if (!cleanEmail || !cleanName) {
    return { success: false, error: 'Email and full name are required.' }
  }

  // 1. Role Permission Enforcement: firm_admin CANNOT invite firm_admin or super_admin
  if (profile.role === 'firm_admin' && (role === 'firm_admin' || (role as string) === 'super_admin')) {
    return { success: false, error: 'Firm Admins can only invite Attorneys and Staff members.' }
  }

  // 2. Check if email is already a registered member of this firm
  const { data: existingUser } = await adminSupabase
    .from('user_profile')
    .select('id')
    .eq('firm_id', profile.firm_id)
    .eq('id', (
      await adminSupabase.from('profiles').select('user_id').eq('display_name', cleanName).maybeSingle()
    )?.data?.user_id || '00000000-0000-0000-0000-000000000000')
    .maybeSingle()

  if (existingUser) {
    return { success: false, error: 'User is already a member of this firm.' }
  }

  // 3. Generate 24-hour UUID token
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // 4. Cancel existing pending invites for this email in this firm
  await adminSupabase
    .from('firm_invitations')
    .delete()
    .eq('firm_id', profile.firm_id)
    .eq('email', cleanEmail)
    .is('accepted_at', null)

  // 5. Insert new invitation
  const { error: insertErr } = await adminSupabase
    .from('firm_invitations')
    .insert({
      firm_id:     profile.firm_id,
      email:       cleanEmail,
      full_name:   cleanName,
      role:        role,
      invited_by:  user.id,
      token:       token,
      expires_at:  expiresAt,
    })

  if (insertErr) {
    return { success: false, error: insertErr.message }
  }

  revalidatePath('/team')
  return { success: true }
}

/** Validate invitation token */
export async function validateInviteToken(token: string) {
  const adminSupabase = await createAdminClient()

  const { data: invite, error } = await adminSupabase
    .from('firm_invitations')
    .select('id, firm_id, email, full_name, role, expires_at, accepted_at, firm:firm_id(name)')
    .eq('token', token)
    .single()

  if (error || !invite) return { valid: false, error: 'Invitation not found or invalid token link.' }
  if (invite.accepted_at) return { valid: false, error: 'This invitation token has already been accepted.' }
  if (new Date(invite.expires_at) < new Date()) return { valid: false, error: 'This invitation has expired. Please ask your firm admin to resend.' }

  return {
    valid: true,
    invite: {
      id:        invite.id,
      email:     invite.email,
      fullName:  invite.full_name,
      role:      invite.role,
      firmName:  (invite.firm as any)?.name ?? 'Law Firm',
    },
  }
}

/** Accept invitation token, create account, and establish session */
export async function acceptTeamInvite({
  token,
  password,
  fullName,
}: {
  token: string
  password: string
  fullName: string
}) {
  const adminSupabase = await createAdminClient()
  const supabase = await createClient()

  const val = await validateInviteToken(token)
  if (!val.valid || !val.invite) {
    return { success: false, error: val.error }
  }

  const invite = val.invite

  // 1. Fetch full invitation details including firm_id
  const { data: fullInvite } = await adminSupabase
    .from('firm_invitations')
    .select('firm_id, email, role')
    .eq('token', token)
    .single()

  if (!fullInvite) return { success: false, error: 'Invitation detail lookup failed.' }

  // 2. Create Auth User
  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
    email:         invite.email,
    password:      password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      firm_id:   fullInvite.firm_id,
      role:      invite.role,
    },
  })

  if (authErr || !authUser.user) {
    return { success: false, error: authErr?.message || 'Failed to create user account.' }
  }

  const userId = authUser.user.id

  // 3. Create user_profile
  await adminSupabase.from('user_profile').upsert({
    id:        userId,
    firm_id:   fullInvite.firm_id,
    full_name: fullName,
    role:      invite.role,
    status:    'active',
  })

  // 4. Create profiles row
  await adminSupabase.from('profiles').upsert({
    user_id:               userId,
    firm_id:               fullInvite.firm_id,
    display_name:          fullName,
    hourly_rate:           0,
    show_phone_to_clients: false,
    practice_areas:        [],
  })

  // 5. Mark invitation accepted
  await adminSupabase
    .from('firm_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)

  // 6. Sign in user
  await supabase.auth.signInWithPassword({ email: invite.email, password })

  const redirectUrl = invite.role === 'firm_admin' ? '/dashboard/admin' : '/dashboard/lawyer'
  return { success: true, redirectUrl }
}

/** Resend an invitation with a fresh token and expiration */
export async function resendInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  const { profile } = await requireAdminUser()
  const adminSupabase = await createAdminClient()

  const newToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error } = await adminSupabase
    .from('firm_invitations')
    .update({
      token:       newToken,
      expires_at:  expiresAt,
      created_at:  new Date().toISOString(),
    })
    .eq('id', invitationId)
    .eq('firm_id', profile.firm_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/team')
  return { success: true }
}

/** Toggle member status (Deactivate / Reactivate) with Sole Super Admin Protection */
export async function toggleUserStatus(targetUserId: string, newStatus: 'active' | 'deactivated'): Promise<{ success: boolean; error?: string }> {
  const { user, profile } = await requireAdminUser()
  const adminSupabase = await createAdminClient()

  // Fetch target user profile
  const { data: targetProfile } = await adminSupabase
    .from('user_profile')
    .select('id, role, firm_id')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile) return { success: false, error: 'Target user not found.' }

  // SOLE SUPER ADMIN PROTECTION RULE:
  // If target is super_admin and being deactivated, check if they are the ONLY super_admin in firm
  if (targetProfile.role === 'super_admin' && newStatus === 'deactivated') {
    const { count: superAdminCount } = await adminSupabase
      .from('user_profile')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', targetProfile.firm_id)
      .eq('role', 'super_admin')
      .eq('status', 'active')

    if ((superAdminCount ?? 0) <= 1) {
      return { success: false, error: 'Promote another member to Super Admin first.' }
    }
  }

  // Update status
  const updatePayload: Record<string, any> = {
    status: newStatus,
  }
  if (newStatus === 'deactivated') {
    updatePayload.deactivated_at = new Date().toISOString()
    updatePayload.deactivated_by = user.id
  } else {
    updatePayload.deactivated_at = null;
    updatePayload.deactivated_by = null;
  }

  const { error } = await adminSupabase
    .from('user_profile')
    .update(updatePayload)
    .eq('id', targetUserId)
    .eq('firm_id', profile.firm_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/team')
  return { success: true }
}

/** Promote user to firm_admin or super_admin with high-friction password re-auth */
export async function promoteUserToAdmin(targetUserId: string, targetRole: 'firm_admin' | 'super_admin', confirmPassword: string): Promise<{ success: boolean; error?: string }> {
  const { user, profile } = await requireAdminUser()
  const adminSupabase = await createAdminClient()
  const supabase = await createClient()

  if (profile.role !== 'super_admin') {
    return { success: false, error: 'Only Super Admins can promote users to Admin roles.' }
  }

  // High-friction password re-auth check
  const { error: passErr } = await supabase.auth.signInWithPassword({
    email:    user.email!,
    password: confirmPassword,
  })

  if (passErr) {
    return { success: false, error: 'Password re-authentication failed. Please re-enter your correct Super Admin password.' }
  }

  const { error: updateErr } = await adminSupabase
    .from('user_profile')
    .update({ role: targetRole })
    .eq('id', targetUserId)
    .eq('firm_id', profile.firm_id)

  if (updateErr) return { success: false, error: updateErr.message }

  revalidatePath('/team')
  return { success: true }
}
