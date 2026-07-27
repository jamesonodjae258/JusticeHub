'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface LawyerCaseCard {
  id: string
  title: string
  status: string
  matter_type: string
  client_name: string | null
  next_court_date: string | null
  updated_at: string
  document_count: number
}

export interface LawyerDashboardData {
  stats: {
    activeCases: number
    upcomingHearings: number
    pendingESignatures: number
    unpaidInvoices: number
  }
  cases: LawyerCaseCard[]
  upcomingEvents: Array<{ id: string; case_title: string; title: string; event_date: string }>
  activities: Array<{ id: string; action: string; entity_type: string; metadata: any; created_at: string }>
  notifications: any[]
  userRole: string
}

export async function getLawyerDashboardData(): Promise<LawyerDashboardData | null> {
  // CRITICAL: Must use standard user client to enforce RLS at the DB query level!
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['attorney', 'staff'].includes(profile.role)) {
    return null
  }

  // 1. RLS-ENFORCED QUERY ON CASES TABLE (assigned_user_id = auth.uid())
  const { data: assignedCases } = await supabase
    .from('case')
    .select('id, title, status, matter_type, client_id, updated_at')
    .order('updated_at', { ascending: false })

  const caseIds = (assignedCases ?? []).map(c => c.id)

  // 2. UPCOMING HEARINGS IN NEXT 7 DAYS
  const todayStr = new Date().toISOString().split('T')[0]
  const sevenDaysLaterStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: rawEvents } = caseIds.length > 0
    ? await supabase
        .from('case_event')
        .select('id, case_id, title, event_date, case:case_id(title)')
        .in('case_id', caseIds)
        .gte('event_date', todayStr)
        .lte('event_date', sevenDaysLaterStr)
        .order('event_date', { ascending: true })
    : { data: [] }

  const upcomingEvents = (rawEvents ?? []).map(e => ({
    id:         e.id,
    case_title: (e.case as any)?.title || 'Case',
    title:      e.title,
    event_date: e.event_date,
  }))

  // 3. FETCH CLIENT NAMES & DOCUMENT COUNTS
  const clientIds = (assignedCases ?? []).map(c => c.client_id).filter(Boolean) as string[]

  let clientNameMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    const { data: clients } = await adminSupabase
      .from('client')
      .select('id, name')
      .in('id', clientIds)

    clients?.forEach(cl => { clientNameMap[cl.id] = cl.name })
  }

  const docCountMap: Record<string, number> = {}
  if (caseIds.length > 0) {
    const { data: docs } = await supabase
      .from('document')
      .select('case_id')
      .in('case_id', caseIds)

    docs?.forEach(d => {
      docCountMap[d.case_id] = (docCountMap[d.case_id] || 0) + 1
    })
  }

  // Next court date per case
  const nextDateMap: Record<string, string> = {}
  if (caseIds.length > 0) {
    const { data: nextEvents } = await supabase
      .from('case_event')
      .select('case_id, event_date')
      .in('case_id', caseIds)
      .gte('event_date', todayStr)
      .order('event_date', { ascending: true })

    nextEvents?.forEach(ne => {
      if (!nextDateMap[ne.case_id]) {
        nextDateMap[ne.case_id] = ne.event_date
      }
    })
  }

  const caseCards: LawyerCaseCard[] = (assignedCases ?? []).map(c => ({
    id:              c.id,
    title:           c.title,
    status:          c.status,
    matter_type:     c.matter_type,
    client_name:     c.client_id ? (clientNameMap[c.client_id] || null) : null,
    next_court_date: nextDateMap[c.id] || null,
    updated_at:      c.updated_at,
    document_count:  docCountMap[c.id] || 0,
  }))

  // 4. MY PERSONAL ACTIVITY FEED (RLS-enforced on activity_log)
  const { data: activities } = caseIds.length > 0
    ? await supabase
        .from('activity_log')
        .select('id, action, entity_type, metadata, created_at')
        .in('entity_id', caseIds)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [] }

  // 5. NOTIFICATIONS FOR LAWYER
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const activeCasesCount = (assignedCases ?? []).filter(c => c.status !== 'Closed').length

  return {
    stats: {
      activeCases:        activeCasesCount,
      upcomingHearings:   upcomingEvents.length,
      pendingESignatures: 0,
      unpaidInvoices:     0,
    },
    cases:              caseCards,
    upcomingEvents,
    activities:         activities ?? [],
    notifications:      notifications ?? [],
    userRole:           profile.role,
  }
}
