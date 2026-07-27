import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditCaseForm } from '@/components/Cases/EditCaseForm'
import { TopBar } from '@/components/AppShell/TopBar'
import type { CaseStatus } from '@/types/database.types'

interface EditCasePageProps {
  params: Promise<{ id: string }>
}

export default async function EditCasePage({ params }: EditCasePageProps) {
  const resolvedParams = await params
  const caseId = resolvedParams.id

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

  // 2. Fetch case data
  const { data: caseData, error: caseErr } = await supabase
    .from('case')
    .select('id, title, status, assigned_user_id')
    .eq('id', caseId)
    .eq('firm_id', profile.firm_id)
    .single()

  if (caseErr || !caseData) {
    redirect('/cases')
  }

  // 3. Fetch staff list for assignment dropdown
  const { data: staffList } = await supabase
    .from('user_profile')
    .select('id, full_name')
    .eq('firm_id', profile.firm_id)
    .in('role', ['firm_admin', 'attorney', 'staff'])
    .order('full_name')

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Edit Case" />

      <main className="app-content">
        <div className="breadcrumb">
          <Link href="/cases">Cases</Link>
          <span className="breadcrumb-sep">/</span>
          <Link href={`/cases/${caseData.id}`}>{caseData.title}</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">Edit</span>
        </div>

        <div className="form-page">
          <EditCaseForm
            caseId={caseData.id}
            currentStatus={caseData.status as CaseStatus}
            currentAssignedId={caseData.assigned_user_id}
            staffList={staffList ?? []}
          />
        </div>
      </main>
    </>
  )
}
