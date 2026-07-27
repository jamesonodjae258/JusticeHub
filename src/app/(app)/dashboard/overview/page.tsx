import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'
import { getSuperAdminDashboardStats } from '@/actions/superadmin'

export default async function SuperAdminOverviewDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    // Return 404 for wrong roles
    redirect('/_not-found')
  }

  const stats = await getSuperAdminDashboardStats()

  return (
    <>
      <TopBar firmName="Platform Overview" title="Super Admin Dashboard" />
      <main className="app-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Super Admin Overview</h1>
            <p className="page-subtitle">Platform health, registered firms, and system activity</p>
          </div>
        </div>

        {stats.maintenanceMode && (
          <div className="sa-banner sa-banner--warning">
            ⚠️ <strong>Maintenance Mode Active</strong> — Non-superadmin users see a maintenance banner across the application.
          </div>
        )}

        <div className="sa-stats-grid">
          <div className="sa-stat-card">
            <span className="sa-stat-label">Total Registered Firms</span>
            <span className="sa-stat-value">{stats.totalFirms}</span>
            <div className="sa-stat-breakdown">
              <span>Free: {stats.firmsByTier.free || 0}</span>
              <span>Pro: {stats.firmsByTier.pro || 0}</span>
            </div>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Monthly Active Users</span>
            <span className="sa-stat-value">{stats.monthlyActiveUsers}</span>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Total Platform Cases</span>
            <span className="sa-stat-value">{stats.totalCases}</span>
          </div>
          <div className="sa-stat-card">
            <span className="sa-stat-label">Total Documents</span>
            <span className="sa-stat-value">{stats.totalDocuments}</span>
          </div>
        </div>
      </main>
    </>
  )
}
