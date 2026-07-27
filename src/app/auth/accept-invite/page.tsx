'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { validateInviteToken, acceptTeamInvite } from '@/actions/userManagement'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [inviteData, setInviteData] = useState<{
    id: string
    email: string
    fullName: string
    role: string
    firmName: string
  } | null>(null)

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    async function verify() {
      if (!token) {
        setErrorMsg('Missing invitation token.')
        setLoading(false)
        return
      }

      const res = await validateInviteToken(token)
      setLoading(false)

      if (!res.valid || !res.invite) {
        setErrorMsg(res.error || 'Invalid or expired invitation token.')
      } else {
        setInviteData(res.invite)
        setFullName(res.invite.fullName)
      }
    }
    verify()
  }, [token])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setErrorMsg('')
    setSubmitting(true)

    const res = await acceptTeamInvite({
      token,
      password,
      fullName,
    })

    setSubmitting(false)

    if (!res.success || !res.redirectUrl) {
      setErrorMsg(res.error || 'Failed to accept invitation.')
    } else {
      router.push(res.redirectUrl)
      router.refresh()
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <div style={{ marginBottom: '0.5rem' }}>
          <JusticeHubLogo showSymbolOnly size="2.5rem" />
        </div>
        <h1 className="auth-logo" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Accept Team Invitation
        </h1>
        {inviteData && (
          <p className="auth-subtitle">Join <strong>{inviteData.firmName}</strong> on JusticeHub</p>
        )}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px' }}>
          Verifying secure invitation link…
        </p>
      ) : errorMsg && !inviteData ? (
        <div className="auth-alert auth-alert--error">{errorMsg}</div>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          {errorMsg && (
            <div className="auth-alert auth-alert--error">{errorMsg}</div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={inviteData?.email || ''}
              readOnly
              disabled
              style={{ background: 'var(--color-surface)', opacity: 0.8 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Assigned Role</label>
            <input
              type="text"
              className="form-input"
              value={(inviteData?.role || '').replace('_', ' ').toUpperCase()}
              readOnly
              disabled
              style={{ background: 'var(--color-surface)', opacity: 0.8, fontWeight: 600 }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-fullname" className="form-label">Your Full Name</label>
            <input
              id="invite-fullname"
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-password" className="form-label">Set Account Password</label>
            <input
              id="invite-password"
              type="password"
              className="form-input"
              placeholder="Choose a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--md"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting ? 'Creating Account & Joining…' : 'Accept Invitation & Sign In'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="auth-page">
      <Suspense fallback={
        <div className="auth-card" style={{ textAlign: 'center', padding: '32px' }}>
          Loading invitation...
        </div>
      }>
        <AcceptInviteForm />
      </Suspense>
    </div>
  )
}
