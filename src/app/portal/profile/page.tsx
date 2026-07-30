import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { updateClientProfile } from '@/actions/profile'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'
import { signOut } from '@/app/auth/actions'

export default async function ClientPortalProfilePage() {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/client-login')

  // Fetch client details
  const { data: clientRecord } = await adminSupabase
    .from('client')
    .select('id, name, email, phone, firm_id, firm:firm_id(name, slug)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!clientRecord) redirect('/auth/client-login')

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('display_name, phone, preferred_language')
    .eq('user_id', user.id)
    .maybeSingle()

  const firmName = (clientRecord.firm as any)?.name ?? 'Law Firm'

  async function handleClientProfileSave(formData: FormData) {
    'use server'
    await updateClientProfile(formData)
  }

  return (
    <div className="portal-container">
      {/* Client Portal Header */}
      <header className="portal-header">
        <div className="portal-header-brand">
          <JusticeHubLogo />
          <span className="portal-header-badge">{firmName}</span>
        </div>
        <div className="portal-header-nav" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/portal" className="nav-item">← Back to Cases</Link>
          <span className="portal-client-name">{clientRecord.name}</span>
          <form action={signOut}>
            <button type="submit" className="btn btn--ghost btn--sm">Sign out</button>
          </form>
        </div>
      </header>

      <main className="portal-content" style={{ maxWidth: '640px', margin: '32px auto' }}>
        <div className="profile-card">
          <h1 className="page-title" style={{ fontSize: '20px', marginBottom: '4px' }}>Client Profile Settings</h1>
          <p className="page-subtitle" style={{ marginBottom: '20px' }}>
            Update your personal contact details and preferred language
          </p>

          <form action={handleClientProfileSave} className="settings-form-layout">
            <div className="form-group">
              <label className="form-label">Email Address (Read-only)</label>
              <input
                type="email"
                className="form-input"
                value={clientRecord.email}
                readOnly
                disabled
                style={{ background: 'var(--color-surface)', opacity: 0.8 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Your Full Name</label>
              <input
                type="text"
                name="display_name"
                className="form-input"
                defaultValue={profile?.display_name || clientRecord.name}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                name="phone"
                className="form-input"
                placeholder="+234 800 000 0000"
                defaultValue={profile?.phone || clientRecord.phone || ''}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Communication Language</label>
              <select
                name="preferred_language"
                className="form-input"
                defaultValue={profile?.preferred_language || 'en'}
              >
                <option value="en">English</option>
                <option value="pcm">Nigerian Pidgin</option>
                <option value="yo">Yoruba</option>
                <option value="ha">Hausa</option>
                <option value="ig">Igbo</option>
              </select>
            </div>

            <div className="profile-actions-bar">
              <button type="submit" className="btn btn--primary">
                Save Portal Profile
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
