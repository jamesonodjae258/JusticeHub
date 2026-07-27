import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import { CaseFilters } from '@/components/Cases/CaseFilters'
import { CaseListTable } from '@/components/Cases/CaseListTable'
import { TopBar } from '@/components/AppShell/TopBar'
import type { CaseStatus } from '@/types/database.types'

interface CasesPageProps {
  searchParams: Promise<{
    status?: string
    attorney?: string
    client?: string
    sortBy?: string
    sortDir?: string
  }>
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const resolvedParams = await searchParams
  const statusFilter = resolvedParams.status as CaseStatus | undefined
  const attorneyFilter = resolvedParams.attorney
  const clientFilter = resolvedParams.client
  const sortBy = resolvedParams.sortBy ?? 'updated_at'
  const sortDir = (resolvedParams.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  const supabase = await createClient()

  // 1. Get user profile and firm
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
    redirect('/auth/login')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  // 2. Fetch filters lists (attorneys and clients)
  const { data: attorneys } = await supabase
    .from('user_profile')
    .select('id, full_name')
    .eq('firm_id', profile.firm_id)
    .in('role', ['firm_admin', 'attorney', 'staff'])
    .order('full_name')

  const { data: clients } = await supabase
    .from('client')
    .select('id, name')
    .eq('firm_id', profile.firm_id)
    .order('name')

  // 3. Build Case list query
  let query = supabase
    .from('case')
    .select(`
      id,
      title,
      matter_type,
      status,
      updated_at,
      created_at,
      assigned_user_id,
      client:client_id(name),
      assigned_user:user_profile(id, full_name)
    `)
    .eq('firm_id', profile.firm_id)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }
  if (attorneyFilter) {
    query = query.eq('assigned_user_id', attorneyFilter)
  }
  if (clientFilter) {
    query = query.eq('client_id', clientFilter)
  }

  // Enforce sort field mapping/whitelist
  const sortColumn = ['title', 'updated_at', 'created_at'].includes(sortBy) ? sortBy : 'updated_at'
  query = query.order(sortColumn, { ascending: sortDir === 'asc' })

  const { data: cases, error: casesErr } = await query

  if (casesErr) {
    console.error('Error loading cases:', casesErr.message)
  }

  // Collect assigned user IDs and fetch avatar URLs
  const assignedUserIds = Array.from(
    new Set((cases ?? []).map(c => c.assigned_user_id).filter((id): id is string => Boolean(id)))
  )

  let avatarUrlMap: Record<string, string> = {}
  if (assignedUserIds.length > 0) {
    const { data: assignedProfiles } = await supabase
      .from('profiles')
      .select('user_id, avatar_url')
      .in('user_id', assignedUserIds)

    const pathMap: Record<string, string> = {}
    const pathsToSign: string[] = []

    assignedProfiles?.forEach(p => {
      if (p.avatar_url) {
        pathMap[p.user_id] = p.avatar_url
        pathsToSign.push(p.avatar_url)
      }
    })

    const { getSignedAvatarUrls } = await import('@/actions/profile')
    const signedMap = await getSignedAvatarUrls(pathsToSign)

    Object.entries(pathMap).forEach(([uid, path]) => {
      if (signedMap[path]) {
        avatarUrlMap[uid] = signedMap[path]
      }
    })
  }

  // Map cases to format expected by CaseListTable
  const formattedCases = (cases ?? []).map(c => {
    const assignedUser = Array.isArray(c.assigned_user)
      ? c.assigned_user[0]
      : c.assigned_user
    const userId = c.assigned_user_id

    return {
      ...c,
      client: Array.isArray(c.client) ? c.client[0] : c.client,
      assigned_user: assignedUser
        ? {
            full_name: assignedUser.full_name,
            avatar_signed_url: userId ? (avatarUrlMap[userId] ?? null) : null,
          }
        : null,
    }
  })

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Case Management">
        <Link href="/cases/new" className="btn btn--primary btn--md" id="new-case-btn">
          {/* Plus icon */}
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: '16px', height: '16px' }} aria-hidden="true">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Case
        </Link>
      </TopBar>

      <main className="app-content">
        <CaseFilters
          attorneys={attorneys ?? []}
          clients={clients ?? []}
          total={cases?.length ?? 0}
        />

        {!cases || cases.length === 0 ? (
          <div className="empty-state">
            {/* Folder Open icon */}
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h2 className="empty-state-title">No cases found</h2>
            <p className="empty-state-desc">
              Get started by creating a new case, or adjust your active filters to find matching cases.
            </p>
            <Link href="/cases/new" className="btn btn--primary btn--md">
              Create Case
            </Link>
          </div>
        ) : (
          <CaseListTableWrapper
            cases={formattedCases as any[]}
            sortBy={sortColumn}
            sortDir={sortDir}
          />
        )}
      </main>
    </>
  )
}

// Client navigation handler for table sorting
function CaseListTableWrapper({
  cases,
  sortBy,
  sortDir,
}: {
  cases: any[]
  sortBy: string
  sortDir: 'asc' | 'desc'
}) {
  return (
    <ClientSortHandler cases={cases} sortBy={sortBy} sortDir={sortDir} />
  )
}

import { ClientSortHandler } from './ClientSortHandler'
