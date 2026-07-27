import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmSettings } from '@/actions/firmSettings'
import { TopBar } from '@/components/AppShell/TopBar'
import { FirmAdminSettingsView } from '@/components/Settings/FirmAdminSettingsView'

export default async function FirmAdminSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  // STRICT 404 REQUIREMENT: Any role other than firm_admin gets 404
  if (!profile || profile.role !== 'firm_admin') {
    notFound()
  }

  const settings = await getFirmSettings()
  if (!settings) notFound()

  return (
    <>
      <TopBar firmName={settings.firm_name} title="Firm Settings (Firm Admin)" />
      <main className="app-content">
        <FirmAdminSettingsView settings={settings} />
      </main>
    </>
  )
}
