import { getSuperAdminFirms } from '@/actions/superadmin'
import { FirmsTable } from '@/components/SuperAdmin/FirmsTable'

export default async function SuperAdminFirmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const params = await searchParams
  const query = params.q || ''
  const status = params.status || 'all'

  const firms = await getSuperAdminFirms(query, status)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Firms Management</h1>
          <p className="page-subtitle">View and manage all law firm accounts registered on JusticeHub</p>
        </div>
      </div>

      <FirmsTable
        firms={firms}
        initialQuery={query}
        initialStatus={status}
      />
    </div>
  )
}
