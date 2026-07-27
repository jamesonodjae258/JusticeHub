'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendInvitation } from '@/actions/team'

interface InviteModalProps {
  onClose: () => void
}

export function InviteModal({ onClose }: InviteModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    const result = await sendInvitation(formData)

    if ('error' in result) {
      setError(result.error ?? 'Failed to send invitation')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Close and refresh after a short delay
    setTimeout(() => {
      onClose()
      router.refresh()
    }, 1500)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
        <div className="modal-header">
          <h2 id="invite-modal-title" className="modal-title">Invite team member</h2>
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
              <p>Invitation sent</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="invite-full-name">Full name</label>
                <input
                  id="invite-full-name"
                  name="full_name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Adaeze Okafor"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="invite-email">Email address</label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  className="form-input"
                  placeholder="e.g. adaeze@firm.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  name="role"
                  className="form-input"
                  required
                  defaultValue="attorney"
                >
                  <option value="attorney">Attorney</option>
                  <option value="staff">Staff</option>
                </select>
                <span className="form-hint">
                  Attorneys can manage cases and documents. Staff have view access with limited permissions.
                </span>
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
                className="btn btn--primary"
                disabled={loading}
                id="send-invite-btn"
              >
                {loading ? 'Sending…' : 'Send invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
