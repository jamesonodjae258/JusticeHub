import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { completeOnboarding } from '@/app/auth/actions'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

export default async function OnboardingRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const error = params.error

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/auth/login?error=not_authenticated')
  }

  const fullName = user.user_metadata?.full_name ?? ''

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ marginBottom: '0.5rem' }}>
            <JusticeHubLogo showSymbolOnly size="2.5rem" />
          </div>
          <h1 className="auth-logo" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Welcome to JusticeHub
          </h1>
          <p className="auth-subtitle">Create your law firm account (Super Admin)</p>
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
              placeholder="e.g. Lexis & Co. Law Practice"
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
              defaultValue={fullName}
              placeholder="e.g. Barrister Jane Doe"
              required
              className="form-input"
            />
          </div>

          <button type="submit" className="btn btn--primary btn--md" style={{ width: '100%' }}>
            Create Firm & Super Admin Account
          </button>
        </form>
      </div>
    </div>
  )
}
