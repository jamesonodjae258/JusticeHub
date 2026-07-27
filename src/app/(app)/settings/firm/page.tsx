import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmSettings, getMemberLoginActivity } from '@/actions/firmSettings'
import { FirmSettingsForm } from '@/components/Settings/FirmSettingsForm'

/**
 * /settings/firm — Firm Settings route
 * Strictly route-guarded for firm_admin role.
 */
export default async function FirmSettingsPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()

  // Route-guard: Redirect non-firm_admin users
  if (!profile || profile.role !== 'firm_admin') {
    redirect('/dashboard')
  }

  const { firmName, settings } = await getFirmSettings()
  const loginActivity = await getMemberLoginActivity()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Firm settings</h1>
          <p className="page-subtitle">Configure your firm details, billing defaults, portal, and security policies</p>
        </div>
      </div>

      <FirmSettingsForm
        initialFirmName={firmName}
        settings={settings}
        loginActivity={loginActivity}
      />
    </div>
  )
}
