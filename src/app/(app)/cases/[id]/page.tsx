import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import { CaseDetailHeader } from '@/components/Cases/CaseDetailHeader'
import { CaseDetailTabs } from '@/components/Cases/CaseDetailTabs'
import { InviteClientButton } from '@/components/Cases/InviteClientButton'
import { TopBar } from '@/components/AppShell/TopBar'
import { getTimeEntriesForCase } from '@/actions/timeTracking'
import { getInvoicesForCase } from '@/actions/invoices'
import { getSignatureRequestsForCase } from '@/actions/signature'
import type { CaseStatus } from '@/types/database.types'

interface CaseDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const resolvedParams = await params
  const caseId = resolvedParams.id

  const supabase = await createClient()

  // 1. Get user profile and firm
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
    redirect('/auth/login')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name, slug')
    .eq('id', profile.firm_id)
    .single()

  // 2. Fetch case details
  const { data: caseData, error: caseErr } = await supabase
    .from('case')
    .select(`
      id,
      title,
      status,
      matter_type,
      created_at,
      updated_at,
      client:client_id(id, name, email, portal_access, auth_user_id),
      assigned_user:user_profile(full_name)
    `)
    .eq('id', caseId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (caseErr || !caseData) {
    redirect('/cases')
  }

  // 3. Fetch audit logs (up to 20, newest first)
  const { data: rawLogs } = await supabase
    .from('audit_log')
    .select('id, action, payload, created_at, actor_id')
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .eq('firm_id', profile.firm_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Map actors manually to bypass PostgREST join limitations
  const actorIds = Array.from(new Set(rawLogs?.map((l) => l.actor_id).filter(Boolean) ?? []))
  const { data: actors } = actorIds.length > 0
    ? await supabase
        .from('user_profile')
        .select('id, full_name')
        .in('id', actorIds)
    : { data: [] }

  const mappedLogs = rawLogs?.map((log) => ({
    id: log.id,
    action: log.action,
    payload: log.payload,
    created_at: log.created_at,
    actor: actors?.find((a) => a.id === log.actor_id) ?? null,
  })) ?? []

  // 4. Fetch staff list for displaying assignment names
  const { data: staffList } = await supabase
    .from('user_profile')
    .select('id, full_name')
    .eq('firm_id', profile.firm_id)
    .in('role', ['firm_admin', 'attorney', 'staff'])

  // 5. Fetch documents for this case
  const { data: rawDocs } = await supabase
    .from('document')
    .select(`
      id,
      filename,
      tag,
      visible_to_client,
      created_at,
      uploaded_by:user_profile(full_name)
    `)
    .eq('case_id', caseId)
    .eq('firm_id', profile.firm_id)
    .order('created_at', { ascending: false })

  const mappedDocuments = rawDocs?.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    tag: doc.tag,
    visible_to_client: doc.visible_to_client,
    created_at: doc.created_at,
    uploaded_by_name: Array.isArray(doc.uploaded_by)
      ? (doc.uploaded_by[0] as any)?.full_name ?? null
      : (doc.uploaded_by as any)?.full_name ?? null,
  })) ?? []

  // 6. Fetch internal notes for this case
  const { data: rawNotes } = await supabase
    .from('note')
    .select(`
      id,
      body,
      created_at,
      author:user_profile(full_name)
    `)
    .eq('case_id', caseId)
    .eq('firm_id', profile.firm_id)
    .order('created_at', { ascending: false })

  const mappedNotes = rawNotes?.map((note) => ({
    id: note.id,
    body: note.body,
    created_at: note.created_at,
    author_name: Array.isArray(note.author)
      ? (note.author[0] as any)?.full_name ?? 'Staff'
      : (note.author as any)?.full_name ?? 'Staff',
  })) ?? []

  // 7. Fetch case events for this case
  const { data: rawEvents } = await supabase
    .from('case_event')
    .select('id, title, event_date, visible_to_client, created_at')
    .eq('case_id', caseId)
    .eq('firm_id', profile.firm_id)
    .order('event_date', { ascending: true })

  const mappedEvents = rawEvents?.map((event) => ({
    id: event.id,
    title: event.title,
    event_date: event.event_date,
    visible_to_client: event.visible_to_client,
    created_at: event.created_at,
  })) ?? []

  // 8. Build Combined Chronological Activity Feed
  const auditItems = mappedLogs.map((log) => ({
    id: log.id,
    action: log.action,
    payload: log.payload,
    created_at: log.created_at,
    actor: log.actor,
  }))

  const noteFeedItems = mappedNotes.map((n) => ({
    id: n.id,
    action: 'note.created',
    payload: { body: n.body },
    created_at: n.created_at,
    actor: { full_name: n.author_name },
  }))

  const eventFeedItems = mappedEvents.map((e) => ({
    id: e.id,
    action: 'event.created',
    payload: { title: e.title, event_date: e.event_date, visible_to_client: e.visible_to_client },
    created_at: e.created_at,
    actor: { full_name: 'Staff' },
  }))

  const combinedFeed = [...auditItems, ...noteFeedItems, ...eventFeedItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // 9. Fetch Time Entries, Totals, Invoices & Signature Requests for this case
  const timeData = await getTimeEntriesForCase(caseId)
  const invoicesList = await getInvoicesForCase(caseId)
  const signatureRequestsList = await getSignatureRequestsForCase(caseId)

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Case Details" />

      <main className="app-content">
        <div className="breadcrumb">
          <Link href="/cases">Cases</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{caseData.title}</span>
        </div>

        <div className="case-detail-layout">
          <div className="case-detail-main">
            <CaseDetailHeader
              caseId={caseData.id}
              title={caseData.title}
              status={caseData.status as CaseStatus}
              matterType={caseData.matter_type}
              clientName={
                Array.isArray(caseData.client)
                  ? (caseData.client[0] as any)?.name ?? '—'
                  : (caseData.client as any)?.name ?? '—'
              }
              assignedAttorney={
                Array.isArray(caseData.assigned_user)
                  ? (caseData.assigned_user[0] as any)?.full_name ?? null
                  : (caseData.assigned_user as any)?.full_name ?? null
              }
              createdAt={caseData.created_at}
              updatedAt={caseData.updated_at}
            />

            <div style={{ marginTop: '1.5rem' }}>
              <CaseDetailTabs
                caseData={caseData as any}
                logs={combinedFeed}
                staffList={staffList ?? []}
                documents={mappedDocuments}
                role={profile.role as any}
                notes={mappedNotes}
                events={mappedEvents}
                timeEntries={timeData.entries}
                timeTotals={timeData.totals}
                invoicesList={invoicesList}
                signatureRequestsList={signatureRequestsList}
                currentUserId={user.id}
              />
            </div>
          </div>

          <aside className="case-detail-sidebar">
            <div className="case-info-card">
              <h3 className="case-info-card-title">Quick Actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link
                  href={`/cases/${caseData.id}/edit`}
                  className="btn btn--secondary btn--md"
                  style={{ width: '100%' }}
                >
                  Update Status / Assignment
                </Link>
              </div>
            </div>

            {(() => {
              const clientInfo = Array.isArray(caseData.client)
                ? (caseData.client[0] as any)
                : (caseData.client as any)
              
              if (!clientInfo || !clientInfo.email) return null

              return (
                <div className="case-info-card" style={{ marginTop: '1rem' }}>
                  <h3 className="case-info-card-title">Portal Invitation</h3>
                  <InviteClientButton
                    clientId={clientInfo.id}
                    clientEmail={clientInfo.email}
                    clientName={clientInfo.name}
                    portalAccess={clientInfo.portal_access}
                    hasAuthUser={!!clientInfo.auth_user_id}
                    firmSlug={firm?.slug ?? ''}
                  />
                </div>
              )
            })()}
          </aside>
        </div>
      </main>
    </>
  )
}
