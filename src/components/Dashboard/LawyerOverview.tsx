'use client'

import Link from 'next/link'
import { LawyerDashboardData } from '@/actions/lawyerDashboard'

interface LawyerOverviewProps {
  data: LawyerDashboardData
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function LawyerOverview({ data }: LawyerOverviewProps) {
  const { stats, cases, upcomingEvents, activities, userRole } = data
  const isAttorney = userRole === 'attorney'

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Lawyer Workspace</h1>
          <p className="page-subtitle">My assigned cases, court hearings, and personal activity log</p>
        </div>

        {/* Quick Actions Bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAttorney && (
            <Link href="/cases/new" className="btn btn--primary btn--md">
              + New Case
            </Link>
          )}

          <Link href="/documents" className="btn btn--secondary btn--md">
            + Upload Document
          </Link>

          {isAttorney && (
            <button type="button" className="btn btn--ghost btn--md" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              📄 Send Invoice (Phase 2)
            </button>
          )}
        </div>
      </div>

      {/* ── TOP STATS ROW (4 CARDS) ── */}
      <div className="stats-row" style={{ marginBottom: '28px' }}>
        <div className="stat-card">
          <div className="stat-label">My Active Cases</div>
          <div className="stat-value">{stats.activeCases}</div>
          <div className="stat-hint">Assigned matters in progress</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Upcoming Hearings (7 Days)</div>
          <div className="stat-value" style={{ color: stats.upcomingHearings > 0 ? 'var(--color-primary)' : undefined }}>
            {stats.upcomingHearings}
          </div>
          <div className="stat-hint">Scheduled court dates</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending E-Signatures</div>
          <div className="stat-value" style={{ color: 'var(--color-text-muted)' }}>0</div>
          <div className="stat-hint">Awaiting signature</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Unpaid Invoices</div>
          <div className="stat-value" style={{ color: 'var(--color-text-muted)' }}>0</div>
          <div className="stat-hint">Pending client payments</div>
        </div>
      </div>

      {/* ── UPCOMING HEARINGS ALERT BANNER (If any in next 7 days) ── */}
      {upcomingEvents.length > 0 && (
        <div className="profile-card" style={{ marginBottom: '28px', borderLeft: '4px solid var(--color-primary)' }}>
          <h2 className="profile-card-title" style={{ fontSize: '15px', color: 'var(--color-primary)' }}>
            📅 Upcoming Court Hearings in Next 7 Days
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {upcomingEvents.map((ev) => (
              <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>{ev.case_title} — {ev.title}</span>
                <span className="badge badge--active">{formatDate(ev.event_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MY CASES GRID ── */}
      <div className="profile-card" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="profile-card-title" style={{ margin: 0, fontSize: '15px' }}>
            My Assigned Cases ({cases.length})
          </h2>
          <Link href="/cases" className="btn btn--ghost btn--sm">View All Cases →</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  padding: '16px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>{c.title}</span>
                  <span className="badge badge--active">{c.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Client: {c.client_name || 'Unassigned'} • Matter: {c.matter_type}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)', paddingTop: '8px', borderTop: '0.5px solid var(--color-border)' }}>
                  <span>📁 {c.document_count} docs</span>
                  <span>📅 Next: {c.next_court_date ? formatDate(c.next_court_date) : 'None'}</span>
                </div>
              </div>
            </Link>
          ))}

          {cases.length === 0 && (
            <p className="team-empty" style={{ gridColumn: '1 / -1' }}>
              No cases currently assigned to you.
            </p>
          )}
        </div>
      </div>

      {/* ── MY ACTIVITY FEED ── */}
      <div className="profile-card">
        <h2 className="profile-card-title" style={{ fontSize: '15px', marginBottom: '16px' }}>
          My Case Activity Log
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
          {activities.map((act) => (
            <div
              key={act.id}
              style={{
                padding: '10px 14px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span className="badge badge--active" style={{ marginRight: '8px' }}>{act.action}</span>
                <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {act.metadata?.title || act.metadata?.filename || act.entity_type}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {formatDate(act.created_at)}
              </span>
            </div>
          ))}

          {activities.length === 0 && (
            <p className="team-empty">No recent activity on your assigned cases.</p>
          )}
        </div>
      </div>
    </div>
  )
}
