import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
    redirect('/auth/login')
  }

  const { data: clients } = await supabase
    .from('client')
    .select('id, name, email, phone, portal_access, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">All clients managed by your firm</p>
        </div>
      </div>

      {clients && clients.length > 0 ? (
        <div className="table-scroll-wrapper">
          <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '600px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <th style={{ padding: '0.75rem 1.25rem 0.75rem 1.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portal Access</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => (
                <tr
                  key={client.id}
                  className="table-row-hover"
                  style={{
                    borderBottom: i < clients.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <td style={{ padding: '1rem 1.25rem 1rem 1.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '2rem', height: '2rem', borderRadius: '50%',
                        background: 'var(--color-primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                      }}>
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{client.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.25rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {client.email || '—'}
                  </td>
                  <td style={{ padding: '1rem 1.25rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {client.phone || '—'}
                  </td>
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      background: client.portal_access ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                      color: client.portal_access ? '#059669' : 'var(--color-text-muted)',
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {client.portal_access ? 'Active' : 'No Access'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.25rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {new Date(client.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="empty-state-title">No clients yet</h3>
          <p className="empty-state-desc">Clients are added when you create a new case. Open a case and use the Invite Client button to get started.</p>
          <Link href="/cases/new" className="btn btn--primary" style={{ marginTop: '1rem' }} id="clients-empty-new-case-btn">
            Create a Case
          </Link>
        </div>
      )}
    </div>
  )
}
