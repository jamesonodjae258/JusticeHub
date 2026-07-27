import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'
import { getSuperAdminDashboardData } from '@/actions/superAdminDashboard'
import { SuperAdminOverview } from '@/components/Dashboard/SuperAdminOverview'
import { NotificationDrawer } from '@/components/AppShell/NotificationDrawer'

export default async function SuperAdminOverviewDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  // STRICT 404 REQUIREMENT: Any role other than super_admin gets 404
  if (!profile || profile.role !== 'super_admin') {
    notFound()
  }

  const data = await getSuperAdminDashboardData()
  if (!data) notFound()

  return (
    <>
      <TopBar
        firmName="JusticeHub Practice"
        title="Super Admin Dashboard"
        actions={<NotificationDrawer notifications={data.notifications} />}
      />
      <main className="app-content">
        <SuperAdminOverview
          stats={data.stats}
          casesByStatus={data.casesByStatus}
          newCases30Days={data.newCases30Days}
          lawyerSummaries={data.lawyerSummaries}
          loginAuditEvents={data.loginAuditEvents}
          initialActivities={data.initialActivities}
          firmId={data.firmId}
        />
      </main>
    </>
  )
}
