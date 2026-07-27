'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Returns the current user's profile. Redirects if not firm_admin. */
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

// ─────────────────────────────────────────────────────────────
// GET TEAM MEMBERS + INVITATIONS
// Returns all user_profile rows in the firm + pending invitations.
// ─────────────────────────────────────────────────────────────
export async function getTeamMembers() {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  // Active + deactivated members (exclude clients and the caller's own super_admin check)
  const { data: members, error: membersErr } = await supabase
    .from('user_profile')
    .select('id, full_name, role, status, created_at, deactivated_at, deactivated_by')
    .eq('firm_id', profile.firm_id)
    .in('role', ['firm_admin', 'attorney', 'staff'])
    .order('created_at', { ascending: true })

  if (membersErr) throw new Error(membersErr.message)

  // Fetch email addresses from auth.users via admin API
  const memberEmails: Record<string, string> = {}
  const memberLastSignIn: Record<string, string | null> = {}

  if (members && members.length > 0) {
    // Use admin API to get user details
    const { data: authUsers } = await adminSupabase.auth.admin.listUsers({
      perPage: 1000,
    })

    if (authUsers?.users) {
      for (const au of authUsers.users) {
        memberEmails[au.id] = au.email ?? ''
        memberLastSignIn[au.id] = au.last_sign_in_at ?? null
      }
    }
  }

  // Enrich members with email and last_sign_in
  const enrichedMembers = (members ?? []).map(m => ({
    ...m,
    email: memberEmails[m.id] ?? '',
    last_sign_in_at: memberLastSignIn[m.id] ?? null,
  }))

  // Pending invitations
  const { data: invitations, error: invErr } = await supabase
    .from('firm_invitations')
    .select('id, email, full_name, role, token, expires_at, accepted_at, created_at, invited_by')
    .eq('firm_id', profile.firm_id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (invErr) throw new Error(invErr.message)

  return {
    members: enrichedMembers,
    invitations: invitations ?? [],
    currentUserId: profile.id,
  }
}

// ─────────────────────────────────────────────────────────────
// SEND INVITATION
// Creates a firm_invitations row and sends the invite email.
// ─────────────────────────────────────────────────────────────
export async function sendInvitation(formData: FormData) {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  const email    = (formData.get('email') as string)?.trim().toLowerCase()
  const fullName = (formData.get('full_name') as string)?.trim()
  const role     = formData.get('role') as string

  if (!email || !fullName || !role) {
    return { error: 'All fields are required.' }
  }

  if (!['attorney', 'staff'].includes(role)) {
    return { error: 'Can only invite as Attorney or Staff.' }
  }

  // Check if email is already a member of this firm
  const { data: authUsers } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
  const existingAuthUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email)

  if (existingAuthUser) {
    const { data: existingProfile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('id', existingAuthUser.id)
      .eq('firm_id', profile.firm_id)
      .maybeSingle()

    if (existingProfile) {
      return { error: 'This email is already a member of your firm.' }
    }
  }

  // Create the invitation row
  const { data: invitation, error: insertErr } = await supabase
    .from('firm_invitations')
    .insert({
      firm_id:    profile.firm_id,
      email,
      full_name:  fullName,
      role,
      invited_by: profile.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, token')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { error: 'A pending invitation already exists for this email.' }
    }
    return { error: insertErr.message }
  }

  // Build the invite URL
  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const inviteUrl = `${protocol}://${host}/auth/accept-invite?token=${invitation.token}`

  // Send invitation email via Supabase admin API
  // The redirect URL points to our custom accept-invite page
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: inviteUrl,
      data: {
        invite_token: invitation.token,
        firm_id:      profile.firm_id,
        role,
        full_name:    fullName,
      },
    }
  )

  if (inviteErr) {
    // If the email send fails, clean up the invitation row
    await supabase
      .from('firm_invitations')
      .delete()
      .eq('id', invitation.id)

    return { error: `Failed to send invite email: ${inviteErr.message}` }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.member_invited',
    entityType: 'firm_invitations',
    entityId:   invitation.id,
    payload:    { email, role, full_name: fullName },
  })

  revalidatePath('/team')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// RESEND INVITATION
// Generates a new token, extends expiry, and re-sends email.
// ─────────────────────────────────────────────────────────────
export async function resendInvitation(invitationId: string) {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  // Fetch the existing invitation
  const { data: invitation, error: fetchErr } = await supabase
    .from('firm_invitations')
    .select('id, email, full_name, role, firm_id, token')
    .eq('id', invitationId)
    .eq('firm_id', profile.firm_id)
    .is('accepted_at', null)
    .single()

  if (fetchErr || !invitation) {
    return { error: 'Invitation not found or already accepted.' }
  }

  // Generate a new token and expiry
  const newToken = crypto.randomUUID()
  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await supabase
    .from('firm_invitations')
    .update({
      token:      newToken,
      expires_at: newExpiry,
    })
    .eq('id', invitationId)

  if (updateErr) {
    return { error: updateErr.message }
  }

  // Build the new invite URL
  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const inviteUrl = `${protocol}://${host}/auth/accept-invite?token=${newToken}`

  // Re-send via Supabase admin API
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(
    invitation.email,
    {
      redirectTo: inviteUrl,
      data: {
        invite_token: newToken,
        firm_id:      profile.firm_id,
        role:         invitation.role,
        full_name:    invitation.full_name,
      },
    }
  )

  if (inviteErr) {
    return { error: `Failed to resend invite: ${inviteErr.message}` }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.invitation_resent',
    entityType: 'firm_invitations',
    entityId:   invitationId,
    payload:    { email: invitation.email },
  })

  revalidatePath('/team')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// CHANGE ROLE (attorney ↔ staff only)
// ─────────────────────────────────────────────────────────────
export async function changeRole(userId: string, newRole: string) {
  const { supabase, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  if (!['attorney', 'staff'].includes(newRole)) {
    return { error: 'Can only change between Attorney and Staff.' }
  }

  if (userId === profile.id) {
    return { error: 'Cannot change your own role.' }
  }

  // Verify target is in the same firm and is attorney or staff
  const { data: target } = await supabase
    .from('user_profile')
    .select('id, role, firm_id')
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (!target) {
    return { error: 'User not found in your firm.' }
  }

  if (!['attorney', 'staff'].includes(target.role)) {
    return { error: 'Can only change role for Attorney or Staff members.' }
  }

  // Use admin client to bypass RLS (firm_admin can't update other users' profiles via RLS)
  const { error: updateErr } = await adminSupabase
    .from('user_profile')
    .update({ role: newRole })
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)

  if (updateErr) {
    return { error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.role_changed',
    entityType: 'user_profile',
    entityId:   userId,
    payload:    { from: target.role, to: newRole },
  })

  revalidatePath('/team')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// PROMOTE TO FIRM ADMIN
// High-friction: requires the caller to re-enter their password.
// ─────────────────────────────────────────────────────────────
export async function promoteToFirmAdmin(userId: string, password: string) {
  const { supabase, user, profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  if (userId === profile.id) {
    return { error: 'You are already a Firm Admin.' }
  }

  // Re-authenticate the caller with their password
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  })

  if (authErr) {
    return { error: 'Incorrect password. Promotion cancelled.' }
  }

  // Verify target is in the same firm
  const { data: target } = await supabase
    .from('user_profile')
    .select('id, role, firm_id, full_name')
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (!target) {
    return { error: 'User not found in your firm.' }
  }

  if (target.role === 'firm_admin') {
    return { error: 'This user is already a Firm Admin.' }
  }

  // Update role to firm_admin via admin client
  const { error: updateErr } = await adminSupabase
    .from('user_profile')
    .update({ role: 'firm_admin' })
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)

  if (updateErr) {
    return { error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.promoted_to_admin',
    entityType: 'user_profile',
    entityId:   userId,
    payload:    { promoted_user: target.full_name, from_role: target.role },
  })

  revalidatePath('/team')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// DEACTIVATE USER
// Sets status to deactivated — JWT hook blocks login.
// ─────────────────────────────────────────────────────────────
export async function deactivateUser(userId: string) {
  const { profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  if (userId === profile.id) {
    return { error: 'Cannot deactivate yourself.' }
  }

  // Verify target is in the same firm
  const { data: target } = await adminSupabase
    .from('user_profile')
    .select('id, full_name, role, firm_id, status')
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (!target) {
    return { error: 'User not found in your firm.' }
  }

  if (target.status === 'deactivated') {
    return { error: 'User is already deactivated.' }
  }

  const { error: updateErr } = await adminSupabase
    .from('user_profile')
    .update({
      status:         'deactivated',
      deactivated_at: new Date().toISOString(),
      deactivated_by: profile.id,
    })
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)

  if (updateErr) {
    return { error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.member_deactivated',
    entityType: 'user_profile',
    entityId:   userId,
    payload:    { deactivated_user: target.full_name, role: target.role },
  })

  revalidatePath('/team')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// REACTIVATE USER
// Restores login access.
// ─────────────────────────────────────────────────────────────
export async function reactivateUser(userId: string) {
  const { profile } = await requireFirmAdmin()
  const adminSupabase = await createAdminClient()

  // Verify target is in the same firm
  const { data: target } = await adminSupabase
    .from('user_profile')
    .select('id, full_name, role, firm_id, status')
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (!target) {
    return { error: 'User not found in your firm.' }
  }

  if (target.status !== 'deactivated') {
    return { error: 'User is not deactivated.' }
  }

  const { error: updateErr } = await adminSupabase
    .from('user_profile')
    .update({
      status:         'active',
      deactivated_at: null,
      deactivated_by: null,
    })
    .eq('id', userId)
    .eq('firm_id', profile.firm_id)

  if (updateErr) {
    return { error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    profile.id,
    action:     'team.member_reactivated',
    entityType: 'user_profile',
    entityId:   userId,
    payload:    { reactivated_user: target.full_name, role: target.role },
  })

  revalidatePath('/team')
  return { success: true }
}
