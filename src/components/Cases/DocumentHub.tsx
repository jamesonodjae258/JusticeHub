'use client'

import React, { useState, useTransition } from 'react'
import { uploadDocument, deleteDocument, toggleDocumentVisibility, getSignedDownloadUrl } from '@/actions/documents'
import { Button } from '@/components/ui/Button'

import { UserRole } from '@/types/database.types'

interface CaseDocument {
  id: string
  filename: string
  tag: string | null
  visible_to_client: boolean
  created_at: string
  uploaded_by_name: string | null
}

interface DocumentHubProps {
  caseId: string
  documents: CaseDocument[]
  role: UserRole
  clientId?: string
  signatureRequests?: any[]
}

const TAG_OPTIONS = ['Pleadings', 'Correspondence', 'Evidence', 'Other']

export function DocumentHub({ caseId, documents, role, clientId, signatureRequests = [] }: DocumentHubProps) {
  const isStaff = role === 'firm_admin' || role === 'attorney' || role === 'staff'
  const [isUploading, startUploadTransition] = useTransition()
  const [uploadError, setUploadError] = useState('')
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  // Handle document upload
  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploadError('')
    const form = e.currentTarget
    const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement
    const file = fileInput?.files?.[0]

    if (!file) {
      setUploadError('Please select a file to upload.')
      return
    }

    const formData = new FormData(form)
    formData.append('case_id', caseId)

    // Send visible_to_client explicitly as string
    const visibilityCheckbox = form.querySelector('input[name="visible_to_client_checkbox"]') as HTMLInputElement
    formData.append('visible_to_client', visibilityCheckbox?.checked ? 'true' : 'false')

    startUploadTransition(async () => {
      try {
        await uploadDocument(formData)
        form.reset()
      } catch (err: any) {
        setUploadError(err.message || 'An error occurred during upload.')
      }
    })
  }

  // Handle visibility toggling
  const handleToggleVisibility = async (docId: string, currentVisible: boolean) => {
    setActionPendingId(docId)
    try {
      await toggleDocumentVisibility(docId, !currentVisible)
    } catch (err: any) {
      alert(err.message || 'Failed to toggle visibility')
    } finally {
      setActionPendingId(null)
    }
  }

  // Handle delete document
  const handleDelete = async (docId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return
    }
    setActionPendingId(docId)
    try {
      await deleteDocument(docId)
    } catch (err: any) {
      alert(err.message || 'Failed to delete document')
    } finally {
      setActionPendingId(null)
    }
  }

  // Handle download document via signed URL
  const handleDownload = async (docId: string) => {
    setActionPendingId(docId)
    try {
      const url = await getSignedDownloadUrl(docId)
      window.open(url, '_blank')
    } catch (err: any) {
      alert(err.message || 'Failed to generate download URL')
    } finally {
      setActionPendingId(null)
    }
  }

  const formatDocDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Upload Form - Staff Only */}
      {isStaff && (
        <form onSubmit={handleUpload} className="form-card" style={{ padding: '1.25rem' }}>
          <h4 className="case-info-card-title" style={{ marginBottom: '0.75rem' }}>Upload Document</h4>
          {uploadError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{uploadError}</div>}
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label htmlFor="file-input" className="form-label">Select File (Max 10MB)</label>
              <input
                id="file-input"
                name="file"
                type="file"
                className="form-input"
                required
                disabled={isUploading}
                style={{ padding: '0.45rem' }}
              />
            </div>

            <div className="form-group" style={{ width: '160px' }}>
              <label htmlFor="tag-input" className="form-label">Tag / Category</label>
              <select id="tag-input" name="tag" className="form-select" disabled={isUploading}>
                {TAG_OPTIONS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', height: '40px' }}>
              <input
                id="visible-input"
                name="visible_to_client_checkbox"
                type="checkbox"
                disabled={isUploading}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="visible-input" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Share with Client
              </label>
            </div>

            <Button type="submit" variant="primary" disabled={isUploading} style={{ height: '40px' }}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </form>
      )}

      {/* Document List */}
      <div className="case-table-wrap">
        <table className="case-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Category</th>
              <th>Uploaded</th>
              <th>Uploaded By</th>
              {isStaff && <th>Shared with Client</th>}
              <th className="case-table-action">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={isStaff ? 6 : 5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  No documents found on this case.
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: 600 }}>{doc.filename}</td>
                  <td>
                    <span className="badge badge--active" style={{ textTransform: 'capitalize' }}>
                      {doc.tag || 'Other'}
                    </span>
                  </td>
                  <td className="case-date">{formatDocDate(doc.created_at)}</td>
                  <td className="case-attorney">{doc.uploaded_by_name ?? 'System'}</td>
                  
                  {isStaff && (
                    <td>
                      <input
                        type="checkbox"
                        checked={doc.visible_to_client}
                        onChange={() => handleToggleVisibility(doc.id, doc.visible_to_client)}
                        disabled={actionPendingId === doc.id}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        title="Toggle sharing with client"
                      />
                    </td>
                  )}

                  <td className="case-table-action">
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn--secondary btn--sm"
                        disabled={actionPendingId === doc.id}
                        onClick={() => handleDownload(doc.id)}
                        title="Download Document"
                      >
                        Download
                      </button>

                      {role === 'attorney' && (
                        <button
                          className="btn btn--primary btn--sm"
                          disabled={actionPendingId === doc.id}
                          onClick={async () => {
                            if (!clientId) {
                              alert('Please assign a client to this case before requesting signatures.')
                              return
                            }
                            setActionPendingId(doc.id)
                            try {
                              const { createSignatureRequest } = await import('@/actions/signature')
                              const res = await createSignatureRequest({ caseId, documentId: doc.id, clientId })
                              if (!res.success) alert(res.error || 'Failed to request signature')
                              else {
                                alert('Signature request sent to client!')
                                window.location.reload()
                              }
                            } catch (e: any) {
                              alert(e.message || 'Signature request error')
                            } finally {
                              setActionPendingId(null)
                            }
                          }}
                          title="Request E-Signature from Client"
                        >
                          ✍️ Request Signature
                        </button>
                      )}

                      {isStaff && (
                        <button
                          className="btn btn--danger btn--sm"
                          disabled={actionPendingId === doc.id}
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          title="Delete Document"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Signature Requests Panel */}
      {signatureRequests.length > 0 && (
        <div className="profile-card" style={{ marginTop: '1.5rem' }}>
          <h4 className="profile-card-title" style={{ fontSize: '15px', marginBottom: '12px' }}>
            Signature Requests ({signatureRequests.length})
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {signatureRequests.map((req: any) => (
              <div
                key={req.id}
                style={{
                  padding: '12px 16px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                      {req.document_name}
                    </span>
                    <span className={`badge ${req.status === 'signed' ? 'badge--active' : req.status === 'declined' ? 'badge--urgent' : 'badge--admin'}`}>
                      {req.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Client: {req.client_name} • Requested: {formatDocDate(req.requested_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {req.signed_doc_url && (
                    <a href={req.signed_doc_url} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
                      👁 View Signed PDF
                    </a>
                  )}

                  {req.status === 'pending' && role === 'attorney' && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={async () => {
                        try {
                          const { sendSignatureReminder } = await import('@/actions/signature')
                          const res = await sendSignatureReminder(req.id)
                          if (!res.success) alert(res.error || 'Failed to send reminder')
                          else alert('Follow-up reminder sent to client!')
                        } catch (e: any) {
                          alert(e.message || 'Reminder error')
                        }
                      }}
                      title="Follow up (Max once per 24 hours)"
                    >
                      ✉️ Follow Up
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
