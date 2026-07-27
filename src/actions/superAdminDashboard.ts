'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSignedAvatarUrls } from '@/actions/profile'

export interface LawyerSummary {
  id: string
  full_name: string
  role: string
  status: string
  avatar_url: string | null
  avatar_signed_url: string | null
  active_case_count: number
  last_login_at: string | null
  last_login_ip: string | null
  last_action: string | null
}

export interface LoginAuditEvent {
  id: string
  user_id: string | null
  user_name: string
  ip_address: string
  device: string
  user_agent: string | null
  success: boolean
  created_at: string
}

export interface ActivityFeedItem {
  id: string
  actor_id: string | null
  actor_name: string
  actor_role: string | null
  actor_avatar_signed_url?: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: any
  created_at: string
}

export async function getSuperAdminDashboardData() {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') return null
  const firmId = profile.firm_id

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. TOP STATS
  const { count: activeCasesCount } = await adminSupabase
    .from('case')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .neq('status', 'Closed')

  const { count: activeLawyersCount } = await adminSupabase
    .from('user_profile')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('role', 'attorney')
    .eq('status', 'active')

  const { count: docsThisMonthCount } = await adminSupabase
    .from('document')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .gte('created_at', startOfMonth)

  const { count: invoicesThisMonthCount } = await adminSupabase
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .gte('created_at', startOfMonth)

  // 2. CASES BY STATUS
  const { data: allCases } = await adminSupabase
    .from('case')
    .select('id, status, created_at')
    .eq('firm_id', firmId)

  const casesByStatus = {
    Intake: 0,
    Active: 0,
    AwaitingCourt: 0,
    Closed: 0,
  }

  const newCases30Days: Record<string, number> = {}

  allCases?.forEach(c => {
    if (c.status === 'Intake') casesByStatus.Intake++
    else if (c.status === 'Active') casesByStatus.Active++
    else if (c.status === 'Awaiting Court' || c.status === 'AwaitingCourt') casesByStatus.AwaitingCourt++
    else if (c.status === 'Closed') casesByStatus.Closed++

    if (c.created_at >= thirtyDaysAgo) {
      const dateKey = c.created_at.split('T')[0]
      newCases30Days[dateKey] = (newCases30Days[dateKey] || 0) + 1
    }
  })

  // 3. LAWYERS LIST
  const { data: lawyers } = await adminSupabase
    .from('user_profile')
    .select('id, full_name, role, status, created_at')
    .eq('firm_id', firmId)
    .in('role', ['attorney', 'staff'])

  const lawyerIds = (lawyers ?? []).map(l => l.id)

  let avatarMap: Record<string, string | null> = {}
  let avatarSignedMap: Record<string, string> = {}
  if (lawyerIds.length > 0) {
    const { data: profilesData } = await adminSupabase
      .from('profiles')
      .select('user_id, avatar_url')
      .in('user_id', lawyerIds)

    const avatarPaths: string[] = []
    profilesData?.forEach(p => {
      avatarMap[p.user_id] = p.avatar_url
      if (p.avatar_url) avatarPaths.push(p.avatar_url)
    })
    avatarSignedMap = await getSignedAvatarUrls(avatarPaths)
  }

  // Active cases per lawyer
  const lawyerCaseCounts: Record<string, number> = {}
  if (lawyerIds.length > 0) {
    const { data: assignedCases } = await adminSupabase
      .from('case')
      .select('assigned_user_id')
      .eq('firm_id', firmId)
      .neq('status', 'Closed')

    assignedCases?.forEach(c => {
      if (c.assigned_user_id) {
        lawyerCaseCounts[c.assigned_user_id] = (lawyerCaseCounts[c.assigned_user_id] || 0) + 1
      }
    })
  }

  // Last logins & last actions
  const { data: lastLogins } = await adminSupabase
    .from('login_audit')
    .select('user_id, created_at, ip_address')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  const lastLoginMap: Record<string, { time: string; ip: string }> = {}
  lastLogins?.forEach(l => {
    if (l.user_id && !lastLoginMap[l.user_id]) {
      lastLoginMap[l.user_id] = { time: l.created_at, ip: l.ip_address }
    }
  })

  const { data: lastActions } = await adminSupabase
    .from('activity_log')
    .select('actor_id, action, created_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  const lastActionMap: Record<string, string> = {}
  lastActions?.forEach(a => {
    if (a.actor_id && !lastActionMap[a.actor_id]) {
      lastActionMap[a.actor_id] = a.action
    }
  })

  const lawyerSummaries: LawyerSummary[] = (lawyers ?? []).map(l => ({
    id:                 l.id,
    full_name:          l.full_name,
    role:               l.role,
    status:             l.status,
    avatar_url:         avatarMap[l.id] || null,
    avatar_signed_url:  avatarMap[l.id] ? (avatarSignedMap[avatarMap[l.id]!] || null) : null,
    active_case_count:  lawyerCaseCounts[l.id] || 0,
    last_login_at:      lastLoginMap[l.id]?.time || null,
    last_login_ip:      lastLoginMap[l.id]?.ip || null,
    last_action:        lastActionMap[l.id] || 'No recent activity',
  }))

  // 4. LOGIN AUDIT (Last 50)
  const { data: rawLoginAudits } = await adminSupabase
    .from('login_audit')
    .select('id, user_id, ip_address, device, user_agent, success, created_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Map user names
  const auditUserIds = (rawLoginAudits ?? []).map(a => a.user_id).filter(Boolean) as string[]
  let userNameMap: Record<string, string> = {}

  if (auditUserIds.length > 0) {
    const { data: userProfiles } = await adminSupabase
      .from('user_profile')
      .select('id, full_name')
      .in('id', auditUserIds)

    userProfiles?.forEach(u => {
      userNameMap[u.id] = u.full_name
    })
  }

  const loginAuditEvents: LoginAuditEvent[] = (rawLoginAudits ?? []).map(a => ({
    id:         a.id,
    user_id:    a.user_id,
    user_name:  a.user_id ? (userNameMap[a.user_id] || 'Unknown User') : 'Anonymous Attempt',
    ip_address: a.ip_address,
    device:     a.device,
    user_agent: a.user_agent,
    success:    a.success,
    created_at: a.created_at,
  }))

  // 5. INITIAL ACTIVITY LOG (Last 50)
  const { data: rawActivity } = await adminSupabase
    .from('activity_log')
    .select('*')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(50)

  const activityActorIds = (rawActivity ?? []).map(a => a.actor_id).filter(Boolean) as string[]
  let actorNameMap: Record<string, string> = {}

  if (activityActorIds.length > 0) {
    const { data: actorProfiles } = await adminSupabase
      .from('user_profile')
      .select('id, full_name')
      .in('id', activityActorIds)

    actorProfiles?.forEach(u => {
      actorNameMap[u.id] = u.full_name
    })
  }

  const initialActivities: ActivityFeedItem[] = (rawActivity ?? []).map(a => ({
    id:          a.id,
    actor_id:    a.actor_id,
    actor_name:  a.actor_id ? (actorNameMap[a.actor_id] || 'System') : 'System',
    actor_role:  a.actor_role,
    action:      a.action,
    entity_type: a.entity_type,
    entity_id:   a.entity_id,
    metadata:    a.metadata,
    created_at:  a.created_at,
  }))

  // 6. UNREAD NOTIFICATIONS COUNT & ITEMS
  const { data: notifications } = await adminSupabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    stats: {
      activeCases:          activeCasesCount || 0,
      activeLawyers:        activeLawyersCount || 0,
      docsThisMonth:        docsThisMonthCount || 0,
      invoicesThisMonth:    invoicesThisMonthCount || 0,
    },
    casesByStatus,
    newCases30Days,
    lawyerSummaries,
    loginAuditEvents,
    initialActivities,
    notifications: notifications ?? [],
    firmId,
  }
}

/** Get cases assigned to a specific lawyer for slide-over */
export async function getLawyerAssignedCases(lawyerId: string) {
  const adminSupabase = await createAdminClient()

  const { data: cases } = await adminSupabase
    .from('case')
    .select('id, title, status, matter_type, updated_at, created_at')
    .eq('assigned_user_id', lawyerId)
    .order('updated_at', { ascending: false })

  return cases ?? []
}

/** Mark all notifications read */
export async function markNotificationsRead() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', user.id)

  revalidatePath('/dashboard/overview')
}
