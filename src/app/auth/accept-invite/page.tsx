'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState<{
    email: string
    full_name: string
    role: string
    firm_name: string
  } | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Validate the token on mount
  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link — no token provided.')
      setLoading(false)
      return
    }

    async function validateToken() {
      try {
        const res = await fetch(`/api/invite/validate?token=${token}`)
        const data = await res.json()

        if (!res.ok || data.error) {
          setError(data.error || 'Invalid or expired invitation.')
        } else {
          setInvitation(data)
        }
      } catch {
        setError('Failed to validate invitation. Try again later.')
      }
      setLoading(false)
    }

    validateToken()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to create account.')
        setSubmitting(false)
        return
      }

      // Redirect to dashboard
      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <JusticeHubLogo variant="light" />
          </div>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Validating invitation…
          </p>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <JusticeHubLogo variant="light" />
          </div>
          <div className="auth-error">{error}</div>
          <a href="/auth/login" className="auth-link" style={{ display: 'block', textAlign: 'center', marginTop: '16px' }}>
            Go to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <JusticeHubLogo variant="light" />
        </div>

        <h1 className="auth-title">Join {invitation?.firm_name}</h1>
        <p className="auth-subtitle">
          You&apos;ve been invited as <strong>{invitation?.role === 'attorney' ? 'an Attorney' : 'a Staff member'}</strong>.
          Set your password to get started.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="invite-name">Name</label>
            <input
              id="invite-name"
              type="text"
              className="form-input"
              value={invitation?.full_name ?? ''}
              disabled
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              className="form-input"
              value={invitation?.email ?? ''}
              disabled
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="invite-password">Password</label>
            <input
              id="invite-password"
              type="password"
              className="form-input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="invite-confirm">Confirm password</label>
            <input
              id="invite-confirm"
              type="password"
              className="form-input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="btn btn--primary auth-submit"
            disabled={submitting}
            id="accept-invite-btn"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">
              <JusticeHubLogo variant="light" />
            </div>
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Loading…
            </p>
          </div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}
