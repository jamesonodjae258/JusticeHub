'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { sendClientOtp, verifyClientOtp, clientSignIn } from '@/app/auth/actions'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

export function ClientLoginForm({
  firmName,
  slug,
}: {
  firmName: string
  slug: string
}) {
  const router = useRouter()

  const [step, setStep] = React.useState<'email' | 'otp-code' | 'password'>('email')
  const [email, setEmail] = React.useState('')
  const [otpCode, setOtpCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  
  const [isLoading, setIsLoading] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState('')
  const [successMsg, setSuccessMsg] = React.useState('')

  // 1. Send the OTP code to client's email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    const res = await sendClientOtp(email, slug)

    if (res.error) {
      setErrorMsg(res.error)
      setIsLoading(false)
    } else {
      setSuccessMsg('A 6-digit verification code has been sent to your email.')
      setStep('otp-code')
      setIsLoading(false)
    }
  }

  // 2. Verify the 6-digit code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !otpCode) return

    setIsLoading(true)
    setErrorMsg('')

    const res = await verifyClientOtp(email, otpCode, slug)

    if (res.error) {
      setErrorMsg(res.error)
      setIsLoading(false)
    } else {
      setSuccessMsg('Authenticated successfully. Redirecting...')
      router.push('/portal')
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
          {firmName}
        </h1>
        <p className="auth-subtitle">Client Case Portal</p>
      </div>

      {successMsg && (
        <div className="auth-alert auth-alert--success">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="auth-alert auth-alert--error">
          {errorMsg}
        </div>
      )}

      {/* STEP 1: Enter Email & Choose Login Method */}
      {step === 'email' && (
        <form onSubmit={handleSendOtp} className="auth-form">
          <p className="auth-description">
            Sign in to view your case files and shared documents.
          </p>

          <div className="form-group">
            <label htmlFor="client-email" className="form-label">
              Your Email Address
            </label>
            <input
              id="client-email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              autoComplete="email"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-btn"
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? 'Sending Code...' : 'Get Sign-In Code (Recommended)'}
          </button>

          <button
            type="button"
            onClick={() => setStep('password')}
            className="auth-btn"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              marginTop: '0.25rem',
            }}
          >
            Sign in with Password
          </button>

          {process.env.NODE_ENV === 'development' && (
            <button
              type="button"
              onClick={() => {
                setEmail('testclient@gmail.com')
                setPassword('ClientPass123!')
                setStep('password')
              }}
              className="auth-btn"
              style={{
                background: 'var(--color-primary-light, #3b82f6)',
                color: 'white',
                marginTop: '0.5rem',
                border: 'none',
              }}
            >
              ⚡ Dev Auto-fill (Test Client)
            </button>
          )}
        </form>
      )}

      {/* STEP 2: Enter 6-digit OTP code */}
      {step === 'otp-code' && (
        <form onSubmit={handleVerifyOtp} className="auth-form">
          <p className="auth-description">
            Please enter the 6-digit verification code sent to <strong>{email}</strong>.
          </p>

          <div className="form-group">
            <label htmlFor="otp-token" className="form-label">
              6-Digit Code
            </label>
            <input
              id="otp-token"
              type="text"
              pattern="[0-9]{6}"
              placeholder="123456"
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
              className="form-input"
              style={{ textAlign: 'center', letterSpacing: '0.5rem', fontSize: '18px', fontWeight: 600 }}
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-btn"
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep('email')
              setSuccessMsg('')
              setErrorMsg('')
            }}
            className="auth-btn"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              marginTop: '0.25rem',
            }}
          >
            Go Back
          </button>
        </form>
      )}

      {/* STEP 3: Sign in with Password */}
      {step === 'password' && (
        <form action={clientSignIn} className="auth-form">
          <input type="hidden" name="slug" value={slug} />

          <div className="form-group">
            <label htmlFor="password-email" className="form-label">
              Your Email Address
            </label>
            <input
              id="password-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              autoComplete="email"
            />
          </div>

          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label htmlFor="client-password" className="form-label">
              Password
            </label>
            <input
              id="client-password"
              name="password"
              type="password"
              placeholder="Your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <button type="submit" className="auth-btn" style={{ marginTop: '0.5rem' }}>
            Sign In with Password
          </button>

          <button
            type="button"
            onClick={() => setStep('email')}
            className="auth-btn"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              marginTop: '0.25rem',
            }}
          >
            Sign in with Code
          </button>

          {process.env.NODE_ENV === 'development' && (
            <button
              type="button"
              onClick={() => {
                setEmail('testclient@gmail.com')
                setPassword('ClientPass123!')
              }}
              className="auth-btn"
              style={{
                background: 'var(--color-primary-light, #3b82f6)',
                color: 'white',
                marginTop: '0.5rem',
                border: 'none',
              }}
            >
              ⚡ Dev Auto-fill (Test Client)
            </button>
          )}
        </form>
      )}

      <p className="auth-footer-link" style={{ marginTop: '24px' }}>
        Are you from the firm?{' '}
        <a href="/auth/login" id="go-to-staff-login-link">Staff sign in</a>
      </p>
    </div>
  )
}
