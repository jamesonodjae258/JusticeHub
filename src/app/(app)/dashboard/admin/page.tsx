import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'

export default async function FirmAdminDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'firm_admin') {
    // Return 404 for wrong roles
    redirect('/_not-found')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  // Fetch firm metrics
  const { count: caseCount } = await supabase.from('case').select('id', { count: 'exact', head: true }).eq('firm_id', profile.firm_id)
  const { count: clientCount } = await supabase.from('client').select('id', { count: 'exact', head: true }).eq('firm_id', profile.firm_id)
  const { count: teamCount } = await supabase.from('user_profile').select('id', { count: 'exact', head: true }).eq('firm_id', profile.firm_id)
  const { count: docCount } = await supabase.from('document').select('id', { count: 'exact', head: true }).eq('firm_id', profile.firm_id)

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Firm Admin Dashboard" />
      <main className="app-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Firm Management Overview</h1>
            <p className="page-subtitle">Administrative control panel for {firm?.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href="/team" className="btn btn--primary btn--md">+ Invite Team Member</Link>
            <Link href="/settings/firm" className="btn btn--secondary btn--md">Firm Settings</Link>
          </div>
        </div>

        <div className="sa-stats-grid">
          <div className="sa-stat-card">
            <span className="sa-stat-label">Active Cases</span>
            <span className="sa-stat-value">{caseCount ?? 0}</span>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Registered Clients</span>
            <span className="sa-stat-value">{clientCount ?? 0}</span>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Team Members</span>
            <span className="sa-stat-value">{teamCount ?? 0}</span>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Case Documents</span>
            <span className="sa-stat-value">{docCount ?? 0}</span>
          </div>
        </div>
      </main>
    </>
  )
}
