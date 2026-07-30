import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeOnboarding } from '@/app/auth/actions'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const error = params.error

  // Get current session/user to verify authentication and prefill full name
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/auth/login?error=not_authenticated')
  }

  // Pre-fill the name from Google metadata if available
  const fullName = user.user_metadata?.full_name ?? ''

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ marginBottom: '0.5rem' }}>
            <JusticeHubLogo showSymbolOnly />
          </div>
          <h1 className="auth-logo" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Welcome to JusticeHub
          </h1>
          <p className="auth-subtitle">Let&apos;s complete your firm setup</p>
        </div>

        {error && (
          <div className="auth-alert auth-alert--error">
            {error === 'missing_fields' ? 'Please fill in all fields.' : error}
          </div>
        )}

        <form action={completeOnboarding} className="auth-form">
          <div className="form-group">
            <label htmlFor="firm_name" className="form-label">
              Firm Name
            </label>
            <input
              id="firm_name"
              name="firm_name"
              type="text"
              placeholder="e.g. Okafor & Associates"
              required
              className="form-input"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="full_name" className="form-label">
              Your Full Name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Your full name"
              required
              defaultValue={fullName}
              className="form-input"
            />
          </div>

          <button type="submit" id="onboarding-submit-btn" className="auth-btn" style={{ marginTop: '1rem' }}>
            Complete Setup & Enter Dashboard
          </button>
        </form>
      </div>
    </div>
  )
}
