import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/AppShell/Sidebar'

/**
 * (app) route group layout
 *
 * - Verifies the session server-side; redirects to /auth/login if unauthenticated.
 * - Renders the fixed sidebar + main content area.
 * - Every child route inside (app)/ inherits this protection for free.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, full_name, role, firm_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
    redirect('/auth/login')
  }

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  return (
    <div className="app-shell">
      <Sidebar
        userName={profile.full_name}
        userRole={profile.role}
        firmName={firm?.name ?? 'Your Firm'}
      />
      <div className="app-content-wrapper">
        {children}
      </div>
    </div>
  )
}
