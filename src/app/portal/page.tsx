import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'
import { ClientCaseList } from '@/components/Portal/ClientCaseList'
import { signOut } from '@/app/auth/actions'
import type { CaseStatus } from '@/types/database.types'

export const dynamic = 'force-dynamic'


export default async function PortalPage() {
  const supabase = await createClient()

  // 1. Get current authenticated client user
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/client-login')

  // 2. Fetch the client profile details
  const { data: clientRecord } = await supabase
    .from('client')
    .select('id, name, portal_access, firm_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!clientRecord || !clientRecord.portal_access) {
    redirect('/auth/client-login?error=no_portal_access')
  }

  // 3. Fetch the client's cases (automatically constrained by database RLS)
  const { data: cases } = await supabase
    .from('case')
    .select('id, title, status, matter_type, updated_at')
    .order('updated_at', { ascending: false })

  const caseIds = cases?.map((c) => c.id) ?? []

  // 4. Fetch explicitly visible documents for these cases
  const { data: rawDocs } = caseIds.length > 0
    ? await supabase
        .from('document')
        .select('id, case_id, filename, tag, created_at')
        .in('case_id', caseIds)
        .eq('visible_to_client', true)
        .order('created_at', { ascending: false })
    : { data: [] }

  // 5. Fetch upcoming events visible to client
  const todayStr = new Date().toISOString().split('T')[0]
  const { data: rawEvents } = caseIds.length > 0
    ? await supabase
        .from('case_event')
        .select('id, case_id, title, event_date')
        .in('case_id', caseIds)
        .eq('visible_to_client', true)
        .gte('event_date', todayStr)
        .order('event_date', { ascending: true })
    : { data: [] }

  // Map documents and next key date to their respective cases
  const casesWithDocs = cases?.map((c) => {
    const caseDocs = rawDocs?.filter((d) => d.case_id === c.id) ?? []
    const caseEvents = rawEvents?.filter((e) => e.case_id === c.id) ?? []
    const nextEvent = caseEvents[0] ? {
      title: caseEvents[0].title,
      event_date: caseEvents[0].event_date,
    } : null

    return {
      id: c.id,
      title: c.title,
      status: c.status as CaseStatus,
      matter_type: c.matter_type,
      updated_at: c.updated_at,
      next_event: nextEvent,
      documents: caseDocs.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        tag: doc.tag,
        created_at: doc.created_at,
      })),
    }
  }) ?? []

  // 6. Fetch firm details
  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', clientRecord.firm_id)
    .single()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Portal Header */}
      <header
        className="app-topbar"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          padding: '0 1.5rem',
        }}
      >
        <div style={{ maxWidth: '960px', width: '100%', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <JusticeHubLogo variant="light" size="1.25rem" />
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem', borderLeft: '1px solid var(--color-border)', paddingLeft: '0.5rem' }}>
              Client Portal
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span className="topbar-firm">{firm?.name ?? 'Law Practice'}</span>
            <form action={signOut}>
              <button type="submit" id="portal-signout-btn" className="btn btn--secondary btn--sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Welcome back
          </p>
          <h2 className="page-title" style={{ marginTop: '0.25rem' }}>
            {clientRecord.name}
          </h2>
          <p className="page-subtitle">
            Secure client file view for cases handled by {firm?.name ?? 'your firm'}.
          </p>
        </div>

        {casesWithDocs.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="empty-state-title">No active cases</h3>
            <p className="empty-state-desc" style={{ maxWidth: '300px' }}>
              We don&apos;t have any active cases listed for your account at this time. Please contact your attorney if you think this is an error.
            </p>
          </div>
        ) : (
          <ClientCaseList cases={casesWithDocs} />
        )}
      </main>
    </div>
  )
}
