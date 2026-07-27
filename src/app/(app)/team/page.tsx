import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers } from '@/actions/team'
import { TeamView } from '@/components/Team/TeamView'

/**
 * /team — Team management page
 *
 * Only accessible to firm_admin. Server-side role check redirects
 * any other role to /dashboard.
 */
export default async function TeamPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'firm_admin') {
    redirect('/dashboard')
  }

  const teamData = await getTeamMembers()

  return (
    <div className="page-content">
      <TeamView
        members={teamData.members}
        invitations={teamData.invitations}
        currentUserId={teamData.currentUserId}
      />
    </div>
  )
}
