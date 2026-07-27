'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { promoteToFirmAdmin } from '@/actions/team'

interface PromoteDialogProps {
  member: {
    id: string
    full_name: string
    role: string
  }
  onClose: () => void
}

export function PromoteDialog({ member, onClose }: PromoteDialogProps) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await promoteToFirmAdmin(member.id, password)

    if ('error' in result) {
      setError(result.error ?? 'Failed to promote user')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    setTimeout(() => {
      onClose()
      router.refresh()
    }, 1500)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="promote-dialog-title">
        <div className="modal-header">
          <h2 id="promote-dialog-title" className="modal-title">Promote to Firm Admin</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="modal-body">
            <div className="team-success">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                <path d="M9 12l2 2l4 -4" />
              </svg>
              <p>{member.full_name} is now a Firm Admin</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="promote-warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4" />
                  <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
                  <path d="M12 16h.01" />
                </svg>
                <div>
                  <strong>This action cannot be easily undone.</strong>
                  <p>
                    Promoting <strong>{member.full_name}</strong> to Firm Admin gives them full
                    control over team members, firm settings, billing, and all cases.
                  </p>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" htmlFor="promote-password">
                  Enter your password to confirm
                </label>
                <input
                  id="promote-password"
                  type="password"
                  className="form-input"
                  placeholder="Your current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="team-error" style={{ marginTop: '8px' }}>{error}</div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary btn--warning-fill"
                disabled={loading || !password}
                id="confirm-promote-btn"
              >
                {loading ? 'Promoting…' : 'Promote to Firm Admin'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
