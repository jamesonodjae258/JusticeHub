import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'
import { getLawyerDashboardData } from '@/actions/lawyerDashboard'
import { LawyerOverview } from '@/components/Dashboard/LawyerOverview'
import { NotificationDrawer } from '@/components/AppShell/NotificationDrawer'

export default async function LawyerDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  // STRICT 404 REQUIREMENT: Any role other than attorney or staff gets 404
  if (!profile || !['attorney', 'staff'].includes(profile.role)) {
    notFound()
  }

  const data = await getLawyerDashboardData()
  if (!data) notFound()

  return (
    <>
      <TopBar
        firmName="Law Practice"
        title="Lawyer Workspace"
        actions={<NotificationDrawer notifications={data.notifications} />}
      />
      <main className="app-content">
        <LawyerOverview data={data} />
      </main>
    </>
  )
}
