import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'invalid_firm':
        return 'The specified firm portal was not found.'
      case 'no_portal_access':
        return 'You do not have portal access under this firm.'
      default:
        return decodeURIComponent(code)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ marginBottom: '0.5rem' }}>
            <JusticeHubLogo showSymbolOnly />
          </div>
          <h1 className="auth-logo" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Client Portal
          </h1>
          <p className="auth-subtitle">Secure Case Access</p>
        </div>

        {error && (
          <div className="auth-alert auth-alert--error">
            {getErrorMessage(error)}
          </div>
        )}

        <div style={{ textAlign: 'center', margin: '20px 0', lineHeight: 1.6 }}>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            To access your client portal, please use the **specific invitation link** sent to you via email by your law firm.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '12px' }}>
            Invitation links contain the secure portal settings for your particular firm (e.g., <code>/portal/firm-name/login</code>).
          </p>
          {process.env.NODE_ENV === 'development' && (
            <div style={{ marginTop: '20px', borderTop: '1px dashed var(--color-border)', paddingTop: '15px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                <strong>Development Quick Access</strong>
              </p>
              <a
                href="/portal/justice-partners/login"
                className="auth-btn"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  textAlign: 'center',
                  background: 'var(--color-primary, #3b82f6)',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  fontSize: '14px',
                }}
              >
                Go to Test Firm Portal
              </a>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                Uses local test slug <code>justice-partners</code>
              </p>
            </div>
          )}
        </div>

        <p className="auth-footer-link" style={{ marginTop: '24px' }}>
          Are you from the firm?{' '}
          <a href="/auth/login" id="go-to-staff-login-link">Staff sign in</a>
        </p>
      </div>
    </div>
  )
}
