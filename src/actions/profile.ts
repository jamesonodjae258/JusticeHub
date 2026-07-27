'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'
import type { ProfileRow, PracticeArea } from '@/types/database.types'

/** TTL for signed avatar URLs: 7 days in seconds (604,800 sec) */
const SIGNED_URL_TTL = 604800

/**
 * Generates a 7-day signed URL for a given avatar storage path.
 * Served strictly via signed URLs — never public bucket URLs (PRD §4.1).
 */
export async function getSignedAvatarUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null

  const adminSupabase = await createAdminClient()
  const { data, error } = await adminSupabase.storage
    .from('avatars')
    .createSignedUrl(storagePath, SIGNED_URL_TTL)

  if (error || !data?.signedUrl) {
    console.error('[profile] Error generating signed avatar URL:', error?.message)
    return null
  }

  return data.signedUrl
}

/**
 * Batch generates 7-day signed URLs for an array of storage paths or user IDs.
 */
export async function getSignedAvatarUrls(paths: (string | null)[]): Promise<Record<string, string>> {
  const validPaths = Array.from(new Set(paths.filter((p): p is string => Boolean(p))))
  if (validPaths.length === 0) return {}

  const adminSupabase = await createAdminClient()
  const result: Record<string, string> = {}

  for (const path of validPaths) {
    const { data } = await adminSupabase.storage
      .from('avatars')
      .createSignedUrl(path, SIGNED_URL_TTL)

    if (data?.signedUrl) {
      result[path] = data.signedUrl
    }
  }

  return result
}

/**
 * Retrieves the current authenticated user's complete profile + profile avatar signed URL.
 * Automatically creates the profile row if it doesn't exist yet.
 */
export async function getProfile() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  // Get user profile details (role, firm_id, full_name)
  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('id, firm_id, full_name, role, status')
    .eq('id', user.id)
    .maybeSingle()

  // Get profile record
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // Auto-create profile if missing
  if (!profile && userProfile) {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        user_id:      user.id,
        firm_id:      userProfile.firm_id,
        display_name: userProfile.full_name,
      })
      .select('*')
      .single()

    profile = newProfile
  }

  const avatarSignedUrl = profile?.avatar_url
    ? await getSignedAvatarUrl(profile.avatar_url)
    : null

  return {
    profile: profile ? {
      ...profile,
      avatar_signed_url: avatarSignedUrl,
    } as ProfileRow : null,
    userProfile,
    email: user.email ?? '',
  }
}

/**
 * Updates the profile for an internal firm member (firm_admin, attorney, staff).
 */
export async function updateProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('Unauthorized')

  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!userProfile) throw new Error('User profile not found')

  const displayName   = (formData.get('display_name') as string)?.trim()
  const title         = (formData.get('title') as string)?.trim() || null
  const phone         = (formData.get('phone') as string)?.trim() || null
  const bio           = (formData.get('bio') as string)?.trim() || null
  const barNumber     = (formData.get('bar_number') as string)?.trim() || null
  const hourlyRateNum = parseFloat((formData.get('hourly_rate') as string) || '0')
  const showPhone     = formData.get('show_phone_to_clients') === 'true'
  const lang          = (formData.get('preferred_language') as string) || 'en'
  const avatarFile    = formData.get('avatar_file') as File | null

  const practiceAreasStr = formData.getAll('practice_areas') as string[]
  const practiceAreas = practiceAreasStr as PracticeArea[]

  if (!displayName) {
    return { success: false, error: 'Full name / display name is required.' }
  }

  if (bio && bio.length > 140) {
    return { success: false, error: 'Bio must be 140 characters or fewer.' }
  }

  let avatarStoragePath: string | undefined = undefined

  // Upload avatar file if provided
  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Avatar image must be under 5MB.' }
    }

    const ext = avatarFile.name.split('.').pop() || 'jpg'
    const filePath = `${user.id}/avatar-${Date.now()}.${ext}`

    const arrayBuffer = await avatarFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadErr } = await adminSupabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: avatarFile.type || 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      return { success: false, error: `Avatar upload failed: ${uploadErr.message}` }
    }

    avatarStoragePath = filePath
  }

  // Update user_profile full_name
  await supabase
    .from('user_profile')
    .update({ full_name: displayName })
    .eq('id', user.id)

  // Build update payload for profiles
  const updatePayload: Record<string, unknown> = {
    display_name:             displayName,
    title:                    title,
    phone:                    phone,
    bio:                      bio,
    show_phone_to_clients:    showPhone,
    preferred_language:       lang,
    updated_at:               new Date().toISOString(),
  }

  if (avatarStoragePath !== undefined) {
    updatePayload.avatar_url = avatarStoragePath
  }

  // Include attorney fields if user is attorney or firm_admin
  if (['attorney', 'firm_admin'].includes(userProfile.role)) {
    updatePayload.bar_number     = barNumber
    updatePayload.practice_areas = practiceAreas
    updatePayload.hourly_rate    = isNaN(hourlyRateNum) ? 0 : hourlyRateNum
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      firm_id: userProfile.firm_id,
      ...updatePayload,
    })

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     userProfile.firm_id,
    actorId:    user.id,
    action:     'profile.updated',
    entityType: 'profiles',
    entityId:   user.id,
    payload:    { display_name: displayName, role: userProfile.role },
  })

  revalidatePath('/profile')
  revalidatePath('/team')
  revalidatePath('/cases')
  revalidatePath('/', 'layout')

  return { success: true }
}

/**
 * Updates profile for a portal client.
 */
export async function updateClientProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('Unauthorized')

  const displayName = (formData.get('display_name') as string)?.trim()
  const phone       = (formData.get('phone') as string)?.trim() || null
  const lang        = (formData.get('preferred_language') as string) || 'en'

  if (!displayName) {
    return { success: false, error: 'Name is required.' }
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .upsert({
      user_id:            user.id,
      display_name:       displayName,
      phone:              phone,
      preferred_language: lang,
      updated_at:         new Date().toISOString(),
    })

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  // Also sync client table name & phone
  await supabase
    .from('client')
    .update({ name: displayName, phone: phone })
    .eq('auth_user_id', user.id)

  revalidatePath('/portal')
  return { success: true }
}
