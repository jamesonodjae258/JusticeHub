import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'
import { getFirmAdminDashboardData } from '@/actions/firmAdminDashboard'
import { FirmAdminOverview } from '@/components/Dashboard/FirmAdminOverview'
import { NotificationDrawer } from '@/components/AppShell/NotificationDrawer'

export default async function FirmAdminDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  // STRICT 404 REQUIREMENT: Any role other than firm_admin gets 404
  if (!profile || profile.role !== 'firm_admin') {
    notFound()
  }

  const data = await getFirmAdminDashboardData()
  if (!data) notFound()

  return (
    <>
      <TopBar
        firmName="Law Practice"
        title="Firm Admin Dashboard"
        actions={<NotificationDrawer notifications={data.notifications} />}
      />
      <main className="app-content">
        <FirmAdminOverview
          stats={data.stats}
          casesList={data.casesList}
          teamList={data.teamList}
          caseActivities={data.caseActivities}
          activeLawyersList={data.activeLawyersList}
        />
      </main>
    </>
  )
}
