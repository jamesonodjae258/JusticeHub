import { searchSuperAdminDocuments } from '@/actions/superadmin'
import { SuperAdminDocumentViewer } from '@/components/SuperAdmin/SuperAdminDocumentViewer'

export default async function SuperAdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const query = params.q || ''

  const documents = await searchSuperAdminDocuments(query)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Document Audit Viewer</h1>
          <p className="page-subtitle">Inspect documents across all registered firms in secure read-only mode</p>
        </div>
      </div>

      <SuperAdminDocumentViewer
        documents={documents}
        initialQuery={query}
      />
    </div>
  )
}
