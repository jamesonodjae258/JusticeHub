'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSignedAvatarUrls } from '@/actions/profile'

export interface FirmAdminCaseItem {
  id: string
  title: string
  status: string
  matter_type: string
  client_name: string | null
  assigned_lawyer_id: string | null
  assigned_lawyer_name: string | null
  assigned_lawyer_avatar_signed_url: string | null
  updated_at: string
}

export interface FirmAdminTeamItem {
  id: string
  full_name: string
  role: string
  status: string
  assigned_case_count: number
  last_active_date: string | null
  avatar_signed_url: string | null
}

export interface FirmAdminActivityItem {
  id: string
  actor_name: string
  action: string
  entity_type: string
  entity_name: string
  created_at: string
}

export async function getFirmAdminDashboardData() {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'firm_admin') return null
  const firmId = profile.firm_id

  // 1. TOP STATS
  const { count: totalCasesCount } = await adminSupabase
    .from('case')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)

  const { count: activeLawyersCount } = await adminSupabase
    .from('user_profile')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('role', 'attorney')
    .eq('status', 'active')

  const { count: portalClientsCount } = await adminSupabase
    .from('client')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('portal_access', true)

  const { count: pendingTimeEntriesCount } = await adminSupabase
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .is('invoice_id', null)

  // 2. CASE LIST WITH ASSIGNED LAWYERS & CLIENTS
  const { data: rawCases } = await adminSupabase
    .from('case')
    .select('id, title, status, matter_type, client_id, assigned_user_id, updated_at')
    .eq('firm_id', firmId)
    .order('updated_at', { ascending: false })

  const clientIds = (rawCases ?? []).map(c => c.client_id).filter(Boolean) as string[]
  const assignedUserIds = (rawCases ?? []).map(c => c.assigned_user_id).filter(Boolean) as string[]

  let clientNameMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    const { data: clients } = await adminSupabase
      .from('client')
      .select('id, name')
      .in('id', clientIds)

    clients?.forEach(cl => { clientNameMap[cl.id] = cl.name })
  }

  let lawyerNameMap: Record<string, string> = {}
  let avatarMap: Record<string, string | null> = {}
  let avatarSignedMap: Record<string, string> = {}

  if (assignedUserIds.length > 0) {
    const { data: lawyers } = await adminSupabase
      .from('user_profile')
      .select('id, full_name')
      .in('id', assignedUserIds)

    lawyers?.forEach(l => { lawyerNameMap[l.id] = l.full_name })

    const { data: profilesData } = await adminSupabase
      .from('profiles')
      .select('user_id, avatar_url')
      .in('user_id', assignedUserIds)

    const avatarPaths: string[] = []
    profilesData?.forEach(p => {
      avatarMap[p.user_id] = p.avatar_url
      if (p.avatar_url) avatarPaths.push(p.avatar_url)
    })
    avatarSignedMap = await getSignedAvatarUrls(avatarPaths)
  }

  const casesList: FirmAdminCaseItem[] = (rawCases ?? []).map(c => ({
    id:                                c.id,
    title:                             c.title,
    status:                            c.status,
    matter_type:                       c.matter_type,
    client_name:                       c.client_id ? (clientNameMap[c.client_id] || null) : null,
    assigned_lawyer_id:               c.assigned_user_id,
    assigned_lawyer_name:             c.assigned_user_id ? (lawyerNameMap[c.assigned_user_id] || null) : null,
    assigned_lawyer_avatar_signed_url: c.assigned_user_id && avatarMap[c.assigned_user_id] ? (avatarSignedMap[avatarMap[c.assigned_user_id]!] || null) : null,
    updated_at:                        c.updated_at,
  }))

  // 3. TEAM PANEL (Lawyers & Staff ONLY — NO IPs or login history)
  const { data: teamMembers } = await adminSupabase
    .from('user_profile')
    .select('id, full_name, role, status, created_at')
    .eq('firm_id', firmId)
    .in('role', ['attorney', 'staff'])

  const teamMemberIds = (teamMembers ?? []).map(m => m.id)

  const caseCountMap: Record<string, number> = {}
  if (teamMemberIds.length > 0) {
    const { data: lawyerCases } = await adminSupabase
      .from('case')
      .select('assigned_user_id')
      .eq('firm_id', firmId)

    lawyerCases?.forEach(lc => {
      if (lc.assigned_user_id) {
        caseCountMap[lc.assigned_user_id] = (caseCountMap[lc.assigned_user_id] || 0) + 1
      }
    })
  }

  // Fetch last active DATE (from latest activity_log entry date, NOT login history or IP)
  const { data: teamActivities } = await adminSupabase
    .from('activity_log')
    .select('actor_id, created_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  const lastActiveDateMap: Record<string, string> = {}
  teamActivities?.forEach(ta => {
    if (ta.actor_id && !lastActiveDateMap[ta.actor_id]) {
      lastActiveDateMap[ta.actor_id] = ta.created_at.split('T')[0] // Date ONLY (no time or IP)
    }
  })

  const teamList: FirmAdminTeamItem[] = (teamMembers ?? []).map(m => ({
    id:                  m.id,
    full_name:          m.full_name,
    role:               m.role,
    status:             m.status,
    assigned_case_count: caseCountMap[m.id] || 0,
    last_active_date:   lastActiveDateMap[m.id] || m.created_at.split('T')[0],
    avatar_signed_url:  avatarMap[m.id] ? (avatarSignedMap[avatarMap[m.id]!] || null) : null,
  }))

  // 4. CASE-LEVEL ACTIVITY FEED ONLY (No login events or session events)
  const { data: rawActivities } = await adminSupabase
    .from('activity_log')
    .select('id, actor_id, actor_role, action, entity_type, metadata, created_at')
    .eq('firm_id', firmId)
    .in('entity_type', ['case', 'document', 'client', 'invoice', 'note']) // STRICT EXCLUSION OF user / login events
    .order('created_at', { ascending: false })
    .limit(50)

  const activityActorIds = (rawActivities ?? []).map(a => a.actor_id).filter(Boolean) as string[]
  let activityActorNameMap: Record<string, string> = {}
  if (activityActorIds.length > 0) {
    const { data: actors } = await adminSupabase
      .from('user_profile')
      .select('id, full_name')
      .in('id', activityActorIds)

    actors?.forEach(ac => { activityActorNameMap[ac.id] = ac.full_name })
  }

  const caseActivities: FirmAdminActivityItem[] = (rawActivities ?? []).map(a => ({
    id:          a.id,
    actor_name:  a.actor_id ? (activityActorNameMap[a.actor_id] || 'Team Member') : 'System',
    action:      a.action,
    entity_type: a.entity_type,
    entity_name: a.metadata?.title || a.metadata?.filename || a.metadata?.full_name || a.entity_type,
    created_at:  a.created_at,
  }))

  // 5. NOTIFICATIONS (Case & Client events ONLY)
  const { data: notifications } = await adminSupabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    stats: {
      totalCases:       totalCasesCount || 0,
      activeLawyers:    activeLawyersCount || 0,
      portalClients:    portalClientsCount || 0,
      pendingInvoices:  pendingTimeEntriesCount || 0,
    },
    casesList,
    teamList,
    caseActivities,
    notifications: notifications ?? [],
    activeLawyersList: teamMembers?.filter(m => m.role === 'attorney' && m.status === 'active') || [],
  }
}

/** Reassign case to a different lawyer */
export async function reassignCaseLawyer(caseId: string, newLawyerId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: profile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['super_admin', 'firm_admin'].includes(profile.role)) {
    return { success: false, error: 'Only Firm Admins and Super Admins can reassign cases.' }
  }

  const { error } = await adminSupabase
    .from('case')
    .update({ assigned_user_id: newLawyerId || null, updated_at: new Date().toISOString() })
    .eq('id', caseId)
    .eq('firm_id', profile.firm_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin')
  revalidatePath('/cases')
  return { success: true }
}
