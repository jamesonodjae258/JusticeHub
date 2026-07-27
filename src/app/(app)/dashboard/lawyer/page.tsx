import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'

export default async function LawyerDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, firm_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['attorney', 'staff'].includes(profile.role)) {
    // Return 404 for wrong roles
    redirect('/_not-found')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  // Fetch assigned/granted cases
  const { data: cases } = await supabase
    .from('case')
    .select('id, title, status, matter_type, updated_at')
    .eq('firm_id', profile.firm_id)
    .order('updated_at', { ascending: false })
    .limit(10)

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Lawyer Workspace" />
      <main className="app-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome back, {profile.full_name}</h1>
            <p className="page-subtitle">Your active legal matters and case workspace</p>
          </div>
          <Link href="/cases/new" className="btn btn--primary btn--md">+ New Case</Link>
        </div>

        <div className="profile-card">
          <h2 className="profile-card-title">Recent Cases</h2>
          <div className="team-table-wrapper" style={{ marginTop: '12px' }}>
            <table className="team-table">
              <thead>
                <tr>
                  <th>Case Title</th>
                  <th>Matter Type</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases?.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td>{c.matter_type}</td>
                    <td><span className="badge badge--active">{c.status}</span></td>
                    <td className="team-date">{new Date(c.updated_at).toLocaleDateString()}</td>
                    <td>
                      <Link href={`/cases/${c.id}`} className="btn btn--ghost btn--sm">
                        View Matter
                      </Link>
                    </td>
                  </tr>
                ))}
                {(!cases || cases.length === 0) && (
                  <tr>
                    <td colSpan={5} className="team-empty">No active cases assigned yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  )
}
