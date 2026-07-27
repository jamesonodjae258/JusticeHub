'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'
import type { NotificationPreferences } from '@/types/database.types'

/** Helper to get current authenticated user or throw */
async function requireAuthUser() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'deactivated') {
    redirect('/auth/login')
  }

  return { supabase, user, profile }
}

/** Update display name */
export async function updateDisplayName(displayName: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, profile } = await requireAuthUser()

  const name = displayName.trim()
  if (!name) return { success: false, error: 'Display name is required.' }

  await supabase
    .from('user_profile')
    .update({ full_name: name })
    .eq('id', user.id)

  await supabase
    .from('profiles')
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  revalidatePath('/settings/account')
  revalidatePath('/', 'layout')
  return { success: true }
}

/** Update email address — requires password confirmation + verification email sent to new address */
export async function updateEmail(currentPassword: string, newEmail: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAuthUser()

  const email = newEmail.trim().toLowerCase()
  if (!email) return { success: false, error: 'New email address is required.' }
  if (email === user.email) return { success: false, error: 'New email is identical to current email.' }

  // Re-authenticate with current password
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  })

  if (authErr) {
    return { success: false, error: 'Incorrect current password.' }
  }

  // Trigger email update
  const { error: updateErr } = await supabase.auth.updateUser({ email })

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  return { success: true }
}

/** Update password — requires current password verification */
export async function updatePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAuthUser()

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters.' }
  }

  // Re-authenticate with current password
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  })

  if (authErr) {
    return { success: false, error: 'Incorrect current password.' }
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  return { success: true }
}

/** Enroll in TOTP 2FA — generates QR code & secret */
export async function enroll2FA(): Promise<{ factorId?: string; qrCode?: string; secret?: string; error?: string }> {
  const { supabase } = await requireAuthUser()

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'JusticeHub',
  })

  if (error || !data) {
    return { error: error?.message ?? 'Failed to enroll in 2FA.' }
  }

  return {
    factorId: data.id,
    qrCode:   data.totp.qr_code,
    secret:   data.totp.secret,
  }
}

/** Verify and activate TOTP 2FA with 6-digit code */
export async function verify2FA(factorId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAuthUser()

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr || !challenge) {
    return { success: false, error: challengeErr?.message ?? '2FA challenge failed.' }
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  })

  if (verifyErr) {
    return { success: false, error: 'Invalid 2FA code. Check your authenticator app.' }
  }

  revalidatePath('/settings/account')
  return { success: true }
}

/** Unenroll / Disable 2FA */
export async function disable2FA(factorId: string): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAuthUser()

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings/account')
  return { success: true }
}

/** Check active 2FA status */
export async function get2FAStatus(): Promise<{ enabled: boolean; factorId?: string }> {
  const { supabase } = await requireAuthUser()

  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) return { enabled: false }

  const verifiedTotp = data.totp.find(f => f.status === 'verified')
  return {
    enabled:  Boolean(verifiedTotp),
    factorId: verifiedTotp?.id,
  }
}

/** Update notification preferences (JSONB) */
export async function updateNotificationPreferences(preferences: NotificationPreferences): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAuthUser()

  const { error } = await supabase
    .from('profiles')
    .update({
      notification_preferences: preferences as any,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/settings/account')
  return { success: true }
}

/** Delete user account — requires 'DELETE' text, password, and sole firm_admin check */
export async function deleteAccount(currentPassword: string, confirmationText: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, profile } = await requireAuthUser()
  const adminSupabase = await createAdminClient()

  if (confirmationText.trim() !== 'DELETE') {
    return { success: false, error: 'You must type "DELETE" exactly to confirm.' }
  }

  // Re-authenticate password
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  })

  if (authErr) {
    return { success: false, error: 'Incorrect password.' }
  }

  // Safeguard: Check if firm_admin and sole admin in firm
  if (profile.role === 'firm_admin') {
    const { count } = await supabase
      .from('user_profile')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', profile.firm_id)
      .eq('role', 'firm_admin')
      .eq('status', 'active')

    if ((count ?? 0) <= 1) {
      return {
        success: false,
        error: 'You are the only Firm Admin in your firm. You must promote another member to Firm Admin before deleting your account.',
      }
    }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    user.id,
    action:     'account.deleted',
    entityType: 'user_profile',
    entityId:   user.id,
    payload:    { email: user.email, role: profile.role },
  })

  // Delete user from auth via admin client (cascade deletes user_profile & profiles)
  const { error: deleteErr } = await adminSupabase.auth.admin.deleteUser(user.id)
  if (deleteErr) {
    return { success: false, error: deleteErr.message }
  }

  await supabase.auth.signOut()
  return { success: true }
}
