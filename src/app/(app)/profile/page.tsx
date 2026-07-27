import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/actions/profile'
import { ProfileForm } from '@/components/Profile/ProfileForm'

/**
 * /profile — Personal profile page for internal firm members
 */
export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['firm_admin', 'attorney', 'staff'].includes(userProfile.role)) {
    redirect('/auth/login')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', userProfile.firm_id)
    .single()

  const { profile, email } = await getProfile()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile settings</h1>
          <p className="page-subtitle">Manage your public information and firm details</p>
        </div>
      </div>

      <ProfileForm
        profile={profile}
        role={userProfile.role}
        firmName={firm?.name ?? 'Your firm'}
        email={email}
      />
    </div>
  )
}
