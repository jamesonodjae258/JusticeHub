import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewCaseForm } from '@/components/Cases/NewCaseForm'
import { TopBar } from '@/components/AppShell/TopBar'

export default async function NewCasePage() {
  const supabase = await createClient()

  // 1. Get user profile and firm
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role')
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

  // 2. Fetch clients and staff list for dropdowns
  const { data: clients } = await supabase
    .from('client')
    .select('id, name')
    .eq('firm_id', profile.firm_id)
    .order('name')

  const { data: attorneys } = await supabase
    .from('user_profile')
    .select('id, full_name')
    .eq('firm_id', profile.firm_id)
    .in('role', ['firm_admin', 'attorney', 'staff'])
    .order('full_name')

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Create New Case" />

      <main className="app-content">
        <div className="breadcrumb">
          <Link href="/cases">Cases</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">New Case</span>
        </div>

        <div className="form-page">
          <NewCaseForm
            initialClients={clients ?? []}
            attorneys={attorneys ?? []}
          />
        </div>
      </main>
    </>
  )
}
