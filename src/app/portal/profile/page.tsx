import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'
import { ClientProfileForm } from '@/components/Portal/ClientProfileForm'
import { getProfile } from '@/actions/profile'

export default async function ClientProfilePage() {
  const supabase = await createClient()

  // 1. Verify client auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/client-login')

  const { data: clientRecord } = await supabase
    .from('client')
    .select('id, name, phone, email, portal_access, firm_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!clientRecord || !clientRecord.portal_access) {
    redirect('/auth/client-login?error=no_portal_access')
  }

  const { profile } = await getProfile()

  return (
    <div className="portal-page">
      <header className="portal-header">
        <div className="portal-header-inner">
          <JusticeHubLogo variant="light" />
          <div className="portal-header-right">
            <Link href="/portal" className="btn btn--ghost btn--sm">
              Back to Portal
            </Link>
          </div>
        </div>
      </header>

      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: '540px', margin: '0 auto' }}>
          <h1 className="portal-title">My Profile</h1>
          <p className="portal-subtitle">Update your personal contact details</p>

          <ClientProfileForm
            profile={profile}
            clientName={clientRecord.name}
            clientPhone={clientRecord.phone}
            clientEmail={user.email ?? clientRecord.email}
          />
        </div>
      </main>
    </div>
  )
}
