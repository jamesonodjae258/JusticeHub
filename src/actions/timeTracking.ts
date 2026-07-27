'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/actions/audit'
import { getSignedAvatarUrls } from '@/actions/profile'
import type { TimeEntryRow } from '@/types/database.types'

/** Requires authenticated attorney or firm_admin user */
async function requireAttorneyUser() {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'deactivated') {
    throw new Error('Account deactivated')
  }

  if (profile.role !== 'attorney') {
    throw new Error('Only attorneys can log time')
  }

  return { supabase, user, profile }
}

/** Pre-fills default hourly rate for current attorney */
export async function getDefaultHourlyRate(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: userExt } = await supabase
    .from('profiles')
    .select('hourly_rate, firm_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (userExt && userExt.hourly_rate > 0) {
    return userExt.hourly_rate
  }

  // Fallback to firm_settings default rate
  if (userExt?.firm_id) {
    const { data: firmSett } = await supabase
      .from('firm_settings')
      .select('default_hourly_rate')
      .eq('firm_id', userExt.firm_id)
      .maybeSingle()

    if (firmSett && firmSett.default_hourly_rate > 0) {
      return firmSett.default_hourly_rate
    }
  }

  return 0
}

/** Fetches time entries for a case with running totals */
export async function getTimeEntriesForCase(caseId: string) {
  const supabase = await createClient()

  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('case_id', caseId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[timeTracking] Error fetching time entries:', error.message)
    return {
      entries: [],
      totals: { totalHours: 0, totalBillableAmount: 0, totalUnbilledAmount: 0, unbilledHours: 0 },
    }
  }

  const userIds = Array.from(new Set((entries ?? []).map(e => e.user_id)))

  // Fetch user profiles & signed avatar URLs
  let userMap = new Map<string, { full_name: string; avatar_url: string | null }>()
  let avatarSignedMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)

    const avatarPaths: string[] = []
    profiles?.forEach(p => {
      userMap.set(p.user_id, { full_name: p.display_name, avatar_url: p.avatar_url })
      if (p.avatar_url) avatarPaths.push(p.avatar_url)
    })

    avatarSignedMap = await getSignedAvatarUrls(avatarPaths)
  }

  let totalMinutes = 0
  let totalBillableAmount = 0
  let unbilledMinutes = 0
  let totalUnbilledAmount = 0

  const enrichedEntries: TimeEntryRow[] = (entries ?? []).map(entry => {
    const durationHours = entry.duration_minutes / 60
    const amount = entry.is_billable ? durationHours * entry.hourly_rate : 0

    totalMinutes += entry.duration_minutes
    if (entry.is_billable) {
      totalBillableAmount += amount
      if (!entry.invoice_id) {
        unbilledMinutes += entry.duration_minutes
        totalUnbilledAmount += amount
      }
    }

    const userInfo = userMap.get(entry.user_id)
    const avatarSignedUrl = userInfo?.avatar_url ? (avatarSignedMap[userInfo.avatar_url] ?? null) : null

    return {
      ...entry,
      user: userInfo ? {
        full_name: userInfo.full_name,
        avatar_url: userInfo.avatar_url,
        avatar_signed_url: avatarSignedUrl,
      } : null,
    }
  })

  return {
    entries: enrichedEntries,
    totals: {
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      totalBillableAmount: Math.round(totalBillableAmount * 100) / 100,
      totalUnbilledAmount: Math.round(totalUnbilledAmount * 100) / 100,
      unbilledHours: Math.round((unbilledMinutes / 60) * 100) / 100,
    },
  }
}

/** Create a new time entry */
export async function createTimeEntry(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, profile } = await requireAttorneyUser()

  const caseId          = formData.get('case_id') as string
  const entryDate       = (formData.get('entry_date') as string) || new Date().toISOString().split('T')[0]
  const hours           = parseInt((formData.get('duration_hours') as string) || '0', 10)
  const minutes         = parseInt((formData.get('duration_minutes') as string) || '0', 10)
  const hourlyRateNum   = parseFloat((formData.get('hourly_rate') as string) || '0')
  const isBillable      = formData.get('is_billable') !== 'false'
  const description     = (formData.get('description') as string)?.trim()

  const totalMinutes = (hours * 60) + minutes

  if (!caseId) return { success: false, error: 'Case ID is required.' }
  if (totalMinutes <= 0) return { success: false, error: 'Duration must be greater than 0.' }
  if (!description) return { success: false, error: 'Description is required.' }

  const { data: newEntry, error: insertErr } = await supabase
    .from('time_entries')
    .insert({
      case_id:          caseId,
      user_id:          user.id,
      firm_id:          profile.firm_id,
      entry_date:       entryDate,
      duration_minutes: totalMinutes,
      hourly_rate:      isNaN(hourlyRateNum) ? 0 : hourlyRateNum,
      is_billable:      isBillable,
      description:      description,
    })
    .select('id')
    .single()

  if (insertErr) {
    return { success: false, error: insertErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    user.id,
    action:     'time_entry.created',
    entityType: 'time_entries',
    entityId:   newEntry.id,
    payload:    { case_id: caseId, duration_minutes: totalMinutes, is_billable: isBillable },
  })

  revalidatePath(`/cases/${caseId}`)
  return { success: true }
}

/** Update an existing time entry (only unbilled) */
export async function updateTimeEntry(entryId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, profile } = await requireAttorneyUser()

  const entryDate       = (formData.get('entry_date') as string) || new Date().toISOString().split('T')[0]
  const hours           = parseInt((formData.get('duration_hours') as string) || '0', 10)
  const minutes         = parseInt((formData.get('duration_minutes') as string) || '0', 10)
  const hourlyRateNum   = parseFloat((formData.get('hourly_rate') as string) || '0')
  const isBillable      = formData.get('is_billable') !== 'false'
  const description     = (formData.get('description') as string)?.trim()

  const totalMinutes = (hours * 60) + minutes

  if (totalMinutes <= 0) return { success: false, error: 'Duration must be greater than 0.' }
  if (!description) return { success: false, error: 'Description is required.' }

  // Check if entry exists and is not billed
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id, case_id, invoice_id, user_id')
    .eq('id', entryId)
    .single()

  if (!existing) return { success: false, error: 'Time entry not found.' }
  if (existing.invoice_id) return { success: false, error: 'Billed time entries are locked and cannot be edited.' }

  const { error: updateErr } = await supabase
    .from('time_entries')
    .update({
      entry_date:       entryDate,
      duration_minutes: totalMinutes,
      hourly_rate:      isNaN(hourlyRateNum) ? 0 : hourlyRateNum,
      is_billable:      isBillable,
      description:      description,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', entryId)

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    user.id,
    action:     'time_entry.updated',
    entityType: 'time_entries',
    entityId:   entryId,
    payload:    { case_id: existing.case_id, duration_minutes: totalMinutes },
  })

  revalidatePath(`/cases/${existing.case_id}`)
  return { success: true }
}

/** Delete an unbilled time entry */
export async function deleteTimeEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
  const { supabase, user, profile } = await requireAttorneyUser()

  const { data: existing } = await supabase
    .from('time_entries')
    .select('id, case_id, invoice_id')
    .eq('id', entryId)
    .single()

  if (!existing) return { success: false, error: 'Time entry not found.' }
  if (existing.invoice_id) return { success: false, error: 'Billed time entries cannot be deleted.' }

  const { error: deleteErr } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', entryId)

  if (deleteErr) {
    return { success: false, error: deleteErr.message }
  }

  await writeAuditLog({
    firmId:     profile.firm_id,
    actorId:    user.id,
    action:     'time_entry.deleted',
    entityType: 'time_entries',
    entityId:   entryId,
    payload:    { case_id: existing.case_id },
  })

  revalidatePath(`/cases/${existing.case_id}`)
  return { success: true }
}
