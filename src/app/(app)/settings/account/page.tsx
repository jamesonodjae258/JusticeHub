import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { get2FAStatus } from '@/actions/accountSettings'
import { getProfile } from '@/actions/profile'
import { AccountSettingsForm } from '@/components/Settings/AccountSettingsForm'

/**
 * /settings/account — Personal Account Settings route
 * Accessible to all logged-in users.
 */
export default async function AccountSettingsPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (!userProfile) redirect('/auth/login')

  const { profile } = await getProfile()
  const twoFactorStatus = await get2FAStatus()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Account settings</h1>
          <p className="page-subtitle">Manage your credentials, 2-factor authentication, and notifications</p>
        </div>
      </div>

      <AccountSettingsForm
        initialDisplayName={userProfile.full_name}
        userEmail={user.email ?? ''}
        userRole={userProfile.role}
        twoFactorStatus={twoFactorStatus}
        profile={profile}
      />
    </div>
  )
}
