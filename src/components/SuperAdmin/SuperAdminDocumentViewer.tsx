'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { viewSuperAdminDocument } from '@/actions/superadmin'

interface DocumentItem {
  id: string
  case_id: string
  firm_id: string
  filename: string
  tag: string | null
  created_at: string
  storage_path: string
  case_title: string
}

interface SuperAdminDocumentViewerProps {
  documents: DocumentItem[]
  initialQuery?: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SuperAdminDocumentViewer({ documents, initialQuery = '' }: SuperAdminDocumentViewerProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialQuery)
  const [activeDoc, setActiveDoc] = useState<DocumentItem | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/superadmin/documents?q=${encodeURIComponent(search)}`)
  }

  async function handleOpenViewer(doc: DocumentItem) {
    setLoadingDocId(doc.id)
    setActiveDoc(doc)
    setPreviewContent(null)

    // MUST CALL SERVER ACTION — LOGS VIEW EVENT TO super_admin_audit_log
    const res = await viewSuperAdminDocument(doc.id)
    setLoadingDocId(null)

    if ('error' in res) {
      setPreviewContent(`Error: ${res.error}`)
    } else {
      setPreviewContent(res.contentPreview)
    }
  }

  return (
    <div>
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="filters-bar" style={{ marginBottom: '20px' }}>
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: '420px' }}
          placeholder="Search by Document Name or Case ID across all firms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn--secondary btn--sm">Search</button>
      </form>

      {/* Documents List */}
      <div className="team-table-wrapper">
        <table className="team-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Case Title</th>
              <th>Tag</th>
              <th>Uploaded Date</th>
              <th>Audit View</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td style={{ fontWeight: 600 }}>{doc.filename}</td>
                <td>{doc.case_title}</td>
                <td>
                  <span className="badge badge--staff">{doc.tag || 'Document'}</span>
                </td>
                <td className="team-date">{formatDate(doc.created_at)}</td>
                <td>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => handleOpenViewer(doc)}
                    disabled={loadingDocId === doc.id}
                  >
                    {loadingDocId === doc.id ? 'Opening…' : 'Inspect (Read-Only)'}
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={5} className="team-empty">No documents found matching search query.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* READ-ONLY DOCUMENT AUDIT VIEWER MODAL */}
      {activeDoc && (
        <div className="modal-backdrop" onClick={() => setActiveDoc(null)}>
          <div
            className="modal sa-doc-modal"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()} // BLOCK RIGHT-CLICK
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Read-Only Document Audit Viewer</h2>
                <p className="profile-hint">{activeDoc.filename} ({activeDoc.case_title})</p>
              </div>
              <button className="modal-close" onClick={() => setActiveDoc(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="sa-doc-banner">
                🔒 <strong>Restricted Audit View Mode</strong>
                <p>
                  Viewing is logged to <code>super_admin_audit_log</code>. Downloading, copying, and editing are strictly disabled.
                </p>
              </div>

              {/* READ-ONLY CONTENT CONTAINER WITH COPY & PRINT RESTRICTIONS */}
              <div
                className="sa-doc-viewer-container"
                onContextMenu={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
              >
                {previewContent ? (
                  <pre className="sa-doc-content">{previewContent}</pre>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px' }}>
                    Loading document audit preview…
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <span className="profile-hint" style={{ marginRight: 'auto' }}>
                Action logged to super_admin_audit_log
              </span>
              <button type="button" className="btn btn--ghost" onClick={() => setActiveDoc(null)}>
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
