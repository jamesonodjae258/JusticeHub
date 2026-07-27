'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface ProfileData {
  user_id: string
  firm_id: string | null
  display_name: string
  title: string | null
  avatar_url: string | null
  avatar_signed_url: string | null
  bio: string | null
  phone: string | null
  bar_number: string | null
  practice_areas: string[]
  hourly_rate: number
  show_phone_to_clients: boolean
  preferred_language: string
  role: string
  firm_name: string | null
  created_at: string
}

/** Single helper for 7-day signed avatar URL */
export async function getSignedAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const map = await getSignedAvatarUrls([path])
  return map[path] || null
}

/** Bulk generate 7-day signed URLs for avatars */
export async function getSignedAvatarUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths || paths.length === 0) return {}
  const adminSupabase = await createAdminClient()
  const result: Record<string, string> = {}

  // Filter out empty paths and duplicates
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))

  await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        const { data, error } = await adminSupabase.storage
          .from('avatars')
          .createSignedUrl(path, 604800) // 7 days TTL (604,800 seconds)

        if (!error && data?.signedUrl) {
          result[path] = data.signedUrl
        }
      } catch (err) {
        console.error('Failed to create signed avatar URL:', err)
      }
    })
  )

  return result
}

/** Get full profile for current user or specific target user */
export async function getProfile(userId?: string): Promise<ProfileData | null> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const targetId = userId || (await supabase.auth.getUser()).data.user?.id
  if (!targetId) return null

  // Fetch user_profile for role & firm_id
  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('id, firm_id, role, full_name, created_at, firm:firm_id(name)')
    .eq('id', targetId)
    .maybeSingle()

  // Fetch profiles table
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('user_id', targetId)
    .maybeSingle()

  if (!userProfile) return null

  let avatarSignedUrl: string | null = null
  if (profile?.avatar_url) {
    const signedMap = await getSignedAvatarUrls([profile.avatar_url])
    avatarSignedUrl = signedMap[profile.avatar_url] || null
  }

  return {
    user_id:               targetId,
    firm_id:               userProfile.firm_id,
    display_name:          profile?.display_name || userProfile.full_name || 'Team Member',
    title:                 profile?.title || null,
    avatar_url:            profile?.avatar_url || null,
    avatar_signed_url:     avatarSignedUrl,
    bio:                   profile?.bio || null,
    phone:                 profile?.phone || null,
    bar_number:            profile?.bar_number || null,
    practice_areas:        profile?.practice_areas || [],
    hourly_rate:           profile?.hourly_rate || 0,
    show_phone_to_clients: profile?.show_phone_to_clients ?? false,
    preferred_language:    profile?.preferred_language || 'en',
    role:                  userProfile.role,
    firm_name:             (userProfile.firm as any)?.name ?? 'Law Firm',
    created_at:            userProfile.created_at,
  }
}

/** Update staff / admin / attorney profile */
export async function updateProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  if (!userProfile) return { success: false, error: 'User profile not found.' }

  const displayName = (formData.get('display_name') as string)?.trim()
  const title       = (formData.get('title') as string)?.trim()
  const bio         = (formData.get('bio') as string)?.trim()
  const phone       = (formData.get('phone') as string)?.trim()
  const avatarFile  = formData.get('avatar') as File | null

  if (bio && bio.length > 140) {
    return { success: false, error: 'Bio must not exceed 140 characters.' }
  }

  let avatarPath: string | null = null
  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Avatar photo must be under 5MB.' }
    }

    const fileExt = avatarFile.name.split('.').pop() || 'png'
    const storagePath = `${user.id}/avatar-${Date.now()}.${fileExt}`

    const { error: uploadErr } = await adminSupabase.storage
      .from('avatars')
      .upload(storagePath, avatarFile, { contentType: avatarFile.type, upsert: true })

    if (uploadErr) {
      return { success: false, error: 'Avatar upload failed: ' + uploadErr.message }
    }
    avatarPath = storagePath
  }

  const profilePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (displayName) profilePayload.display_name = displayName
  if (title !== undefined) profilePayload.title = title || null
  if (bio !== undefined) profilePayload.bio = bio || null
  if (phone !== undefined) profilePayload.phone = phone || null
  if (avatarPath) profilePayload.avatar_url = avatarPath

  // Attorney-specific fields
  if (userProfile.role === 'attorney') {
    const barNumber = (formData.get('bar_number') as string)?.trim()
    const hourlyRateStr = formData.get('hourly_rate') as string
    const showPhone = formData.get('show_phone_to_clients') === 'on' || formData.get('show_phone_to_clients') === 'true'
    const practiceAreasRaw = formData.getAll('practice_areas') as string[]

    if (barNumber !== undefined) profilePayload.bar_number = barNumber || null
    if (hourlyRateStr !== undefined) profilePayload.hourly_rate = parseFloat(hourlyRateStr) || 0
    profilePayload.show_phone_to_clients = showPhone
    if (practiceAreasRaw.length > 0) profilePayload.practice_areas = practiceAreasRaw
  }

  // Update profiles table
  const { error: updateErr } = await adminSupabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      firm_id: userProfile.firm_id,
      ...profilePayload,
    })

  if (updateErr) return { success: false, error: updateErr.message }

  // Sync display_name with user_profile.full_name
  if (displayName) {
    await adminSupabase
      .from('user_profile')
      .update({ full_name: displayName })
      .eq('id', user.id)
  }

  revalidatePath('/profile')
  revalidatePath('/team')
  revalidatePath('/dashboard')
  return { success: true }
}

/** Update client profile (inside /portal/profile) */
export async function updateClientProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const displayName = (formData.get('display_name') as string)?.trim()
  const phone       = (formData.get('phone') as string)?.trim()
  const lang        = (formData.get('preferred_language') as string) || 'en'

  const { error } = await adminSupabase
    .from('profiles')
    .upsert({
      user_id:            user.id,
      display_name:       displayName,
      phone:              phone || null,
      preferred_language: lang,
      updated_at:         new Date().toISOString(),
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/portal/profile')
  return { success: true }
}
