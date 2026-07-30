import { signUp } from '@/app/auth/actions'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const params = await searchParams
  const error   = params.error
  const success = params.success

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ marginBottom: '0.5rem' }}>
            <JusticeHubLogo showSymbolOnly />
          </div>
          <p className="auth-subtitle">Create your firm account</p>
        </div>

        {success === 'check_email' && (
          <div className="auth-alert auth-alert--success">
            Account created! Check your email to confirm and activate your account.
          </div>
        )}

        {error && (
          <div className="auth-alert auth-alert--error">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={signUp} className="auth-form">
          <div className="form-group">
            <label htmlFor="firm_name" className="form-label">
              Firm name
            </label>
            <input
              id="firm_name"
              name="firm_name"
              type="text"
              placeholder="e.g. Okafor & Associates"
              required
              className="form-input"
              autoComplete="organization"
            />
          </div>

          <div className="form-group">
            <label htmlFor="full_name" className="form-label">
              Your name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Full name"
              required
              className="form-input"
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-email" className="form-label">
              Work email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@yourfirm.com"
              required
              className="form-input"
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password" className="form-label">
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="form-input"
              autoComplete="new-password"
            />
          </div>

          <button type="submit" id="signup-submit-btn" className="auth-btn">
            Create account
          </button>
        </form>

        <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        </div>

        <GoogleSignInButton mode="signup" />

        <p className="auth-footer-link">
          Already have an account?{' '}
          <a href="/auth/login" id="go-to-login-link">Sign in</a>
        </p>
      </div>
    </div>
  )
}
