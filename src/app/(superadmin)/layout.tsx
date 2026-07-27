import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'
import { signOut } from '@/app/auth/actions'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // 1. Verify session
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    // Return 404 to hide the existence of the superadmin route group from unauthenticated users
    notFound()
  }

  // 2. Verify super_admin role
  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, status, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'super_admin' || profile.status === 'deactivated') {
    // Return 404 to hide the existence of the superadmin route group from other roles
    notFound()
  }

  // 3. Verify 2FA status
  const { data: mfaData } = await supabase.auth.mfa.listFactors()
  const hasVerified2FA = Boolean(mfaData?.totp?.some(f => f.status === 'verified'))

  return (
    <div className="superadmin-shell">
      <header className="superadmin-nav">
        <div className="superadmin-nav-inner">
          <div className="superadmin-nav-left">
            <JusticeHubLogo variant="dark" />
            <span className="badge badge--urgent" style={{ marginLeft: '12px' }}>Super Admin</span>
          </div>

          <nav className="superadmin-menu">
            <Link href="/superadmin" className="superadmin-menu-item">Dashboard</Link>
            <Link href="/superadmin/firms" className="superadmin-menu-item">Firms</Link>
            <Link href="/superadmin/documents" className="superadmin-menu-item">Document Audit</Link>
            <Link href="/superadmin/feature-flags" className="superadmin-menu-item">Feature Flags</Link>
            <Link href="/superadmin/email-templates" className="superadmin-menu-item">Email Templates</Link>
          </nav>

          <div className="superadmin-nav-right">
            <span className="superadmin-user-name">{profile.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="btn btn--ghost btn--sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      {!hasVerified2FA ? (
        <div className="page-content" style={{ maxWidth: '600px', margin: '40px auto' }}>
          <div className="profile-card danger-card">
            <h2 className="profile-card-title" style={{ color: 'var(--color-danger)' }}>2FA Required for Super Admin</h2>
            <p className="profile-hint" style={{ color: '#991B1B', marginBottom: '16px' }}>
              Security Requirement: Super Admin access requires 2-Factor Authentication (2FA).
              Please enable 2FA on your account settings to unlock access.
            </p>
            <Link href="/settings/account" className="btn btn--primary btn--md">
              Set up 2FA in Account Settings
            </Link>
          </div>
        </div>
      ) : (
        <main className="superadmin-main">
          {children}
        </main>
      )}
    </div>
  )
}
