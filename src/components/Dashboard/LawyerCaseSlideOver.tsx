'use client'

import { useState, useEffect } from 'react'
import { getLawyerAssignedCases } from '@/actions/superAdminDashboard'

interface LawyerCaseSlideOverProps {
  lawyerId: string
  lawyerName: string
  onClose: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function LawyerCaseSlideOver({ lawyerId, lawyerName, onClose }: LawyerCaseSlideOverProps) {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const data = await getLawyerAssignedCases(lawyerId)
      setCases(data)
      setLoading(false)
    }
    load()
  }, [lawyerId])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '540px',
          height: '100vh',
          margin: '0 0 0 auto',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{lawyerName}&apos;s Assigned Cases</h2>
            <span className="profile-hint">Read-only view for Super Admin</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px' }}>Loading cases...</p>
          ) : cases.length === 0 ? (
            <p className="team-empty">No active or assigned cases found for this attorney.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cases.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.title}</span>
                    <span className="badge badge--active">{c.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    <span>Matter: {c.matter_type}</span>
                    <span>Updated: {formatDate(c.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Close Slide-over</button>
        </div>
      </div>
    </div>
  )
}
