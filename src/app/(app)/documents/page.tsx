import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DocumentsPage() {
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

  const { data: documents } = await supabase
    .from('document')
    .select(`
      id, filename, tag, visible_to_client, created_at, storage_path,
      case:case_id ( id, title ),
      uploader:uploaded_by ( full_name )
    `)
    .order('created_at', { ascending: false })

  type Doc = {
    id: string
    filename: string
    tag: string | null
    visible_to_client: boolean
    created_at: string
    storage_path: string | null
    case: { id: string; title: string } | null
    uploader: { full_name: string } | null
  }

  const docs = (documents ?? []) as unknown as Doc[]

  const tagColour: Record<string, string> = {
    Correspondence:    '#3B82F6',
    Pleadings:         '#8B5CF6',
    Evidence:          '#EF4444',
    Contract:          '#F59E0B',
    Court_Order:       '#10B981',
    Internal:          '#64748B',
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">All documents uploaded across your firm's cases</p>
        </div>
      </div>

      {docs.length > 0 ? (
        <div className="table-scroll-wrapper">
          <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: '700px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                {['File', 'Case', 'Tag', 'Shared with Client', 'Uploaded by', 'Date'].map((h, index) => (
                  <th key={h} style={{ padding: `0.75rem 1.25rem 0.75rem ${index === 0 ? '1.75rem' : '1.25rem'}`, textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => {
                const ext = doc.filename.split('.').pop()?.toUpperCase() ?? 'FILE'
                const colour = tagColour[doc.tag ?? ''] ?? '#64748B'
                return (
                  <tr
                    key={doc.id}
                    style={{ borderBottom: i < docs.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                  >
                    <td style={{ padding: '1rem 1.25rem 1rem 1.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{
                          padding: '0.15rem 0.4rem', borderRadius: '4px',
                          fontSize: '0.65rem', fontWeight: 700,
                          background: 'rgba(100,116,139,0.12)',
                          color: 'var(--color-text-muted)', flexShrink: 0,
                        }}>{ext}</span>
                        <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--color-text)', wordBreak: 'break-word' }}>
                          {doc.filename}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      {doc.case ? (
                        <a href={`/cases/${doc.case.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                          {doc.case.title}
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      {doc.tag ? (
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          padding: '0.2rem 0.6rem', borderRadius: '9999px',
                          background: `${colour}1A`, color: colour,
                        }}>
                          {doc.tag.replace('_', ' ')}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        background: doc.visible_to_client ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                        color: doc.visible_to_client ? '#059669' : 'var(--color-text-muted)',
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                        {doc.visible_to_client ? 'Shared' : 'Private'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      {doc.uploader?.full_name ?? '—'}
                    </td>
                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="empty-state-title">No documents yet</h3>
          <p className="empty-state-desc">Documents are uploaded from inside a case. Open a case and use the Documents tab to upload files.</p>
        </div>
      )}
    </div>
  )
}
