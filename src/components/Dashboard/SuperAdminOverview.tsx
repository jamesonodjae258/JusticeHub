'use client'

import { useState } from 'react'
import { LawyerSummary, LoginAuditEvent, ActivityFeedItem } from '@/actions/superAdminDashboard'
import { RealtimeActivityFeed } from '@/components/Dashboard/RealtimeActivityFeed'
import { LawyerCaseSlideOver } from '@/components/Dashboard/LawyerCaseSlideOver'

interface SuperAdminOverviewProps {
  stats: {
    activeCases: number
    activeLawyers: number
    docsThisMonth: number
    invoicesThisMonth: number
  }
  casesByStatus: {
    Intake: number
    Active: number
    AwaitingCourt: number
    Closed: number
  }
  newCases30Days: Record<string, number>
  lawyerSummaries: LawyerSummary[]
  loginAuditEvents: LoginAuditEvent[]
  initialActivities: ActivityFeedItem[]
  firmId: string
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SuperAdminOverview({
  stats,
  casesByStatus,
  lawyerSummaries,
  loginAuditEvents,
  initialActivities,
  firmId,
}: SuperAdminOverviewProps) {
  // Slide-over state
  const [selectedLawyer, setSelectedLawyer] = useState<{ id: string; name: string } | null>(null)

  // Login Audit Search Filter
  const [auditSearch, setAuditSearch] = useState('')

  const filteredAuditEvents = loginAuditEvents.filter(a =>
    a.user_name.toLowerCase().includes(auditSearch.toLowerCase()) ||
    a.ip_address.includes(auditSearch)
  )

  const totalStatusCases = (casesByStatus.Intake + casesByStatus.Active + casesByStatus.AwaitingCourt + casesByStatus.Closed) || 1

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Super Admin Dashboard</h1>
          <p className="page-subtitle">Firm-wide platform analytics, security audit log, and live activity oversight</p>
        </div>
      </div>

      {/* ── TOP STATS ROW (4 CARDS) ── */}
      <div className="stats-row" style={{ marginBottom: '28px' }}>
        <div className="stat-card">
          <div className="stat-label">Active Cases</div>
          <div className="stat-value">{stats.activeCases}</div>
          <div className="stat-hint">Total open matters in firm</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Lawyers</div>
          <div className="stat-value">{stats.activeLawyers}</div>
          <div className="stat-hint">Active attorneys count</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Docs Uploaded (Month)</div>
          <div className="stat-value">{stats.docsThisMonth}</div>
          <div className="stat-hint">Case documents this month</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Time Entries (Month)</div>
          <div className="stat-value">{stats.invoicesThisMonth}</div>
          <div className="stat-hint">Billable entries logged</div>
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Active Cases by Status Horizontal Bar Breakdown */}
        <div className="profile-card">
          <h2 className="profile-card-title" style={{ fontSize: '15px' }}>Active Cases by Status</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span>Intake</span>
                <span>{casesByStatus.Intake}</span>
              </div>
              <div style={{ height: '8px', background: 'var(--color-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(casesByStatus.Intake / totalStatusCases) * 100}%`, height: '100%', background: '#3B82F6' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span>Active</span>
                <span>{casesByStatus.Active}</span>
              </div>
              <div style={{ height: '8px', background: 'var(--color-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(casesByStatus.Active / totalStatusCases) * 100}%`, height: '100%', background: '#10B981' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span>Awaiting Court</span>
                <span>{casesByStatus.AwaitingCourt}</span>
              </div>
              <div style={{ height: '8px', background: 'var(--color-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(casesByStatus.AwaitingCourt / totalStatusCases) * 100}%`, height: '100%', background: '#F59E0B' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span>Closed</span>
                <span>{casesByStatus.Closed}</span>
              </div>
              <div style={{ height: '8px', background: 'var(--color-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(casesByStatus.Closed / totalStatusCases) * 100}%`, height: '100%', background: '#6B7280' }} />
              </div>
            </div>
          </div>
        </div>

        {/* 30-Day Growth Overview */}
        <div className="profile-card">
          <h2 className="profile-card-title" style={{ fontSize: '15px' }}>Lawyer Roster Status</h2>
          <div style={{ marginTop: '16px' }}>
            <div className="stat-value" style={{ fontSize: '32px', color: 'var(--color-primary)' }}>{lawyerSummaries.length}</div>
            <div className="stat-hint" style={{ marginTop: '4px' }}>Attorneys & paralegals on firm roster</div>
            <p className="profile-hint" style={{ marginTop: '16px' }}>
              Click any attorney row in the table below to open their assigned case list slide-over.
            </p>
          </div>
        </div>
      </div>

      {/* ── LAWYERS TABLE ── */}
      <div className="team-table-wrapper" style={{ marginBottom: '28px' }}>
        <h2 className="profile-card-title" style={{ padding: '16px 20px 0 20px', fontSize: '15px' }}>
          Firm Lawyers Overview ({lawyerSummaries.length})
        </h2>
        <table className="team-table">
          <thead>
            <tr>
              <th>Lawyer</th>
              <th>Role</th>
              <th>Active Cases</th>
              <th>Last Login</th>
              <th>Last Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lawyerSummaries.map((lawyer) => (
              <tr
                key={lawyer.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedLawyer({ id: lawyer.id, name: lawyer.full_name })}
              >
                <td>
                  <div className="team-member-cell">
                    <div className="avatar-sm">
                      {lawyer.avatar_signed_url ? (
                        <img src={lawyer.avatar_signed_url} alt="" className="avatar-img" />
                      ) : (
                        <span className="avatar-fallback">{lawyer.full_name.charAt(0)}</span>
                      )}
                    </div>
                    <span className="team-member-name">{lawyer.full_name}</span>
                  </div>
                </td>
                <td><span className="badge badge--active">{lawyer.role.toUpperCase()}</span></td>
                <td style={{ fontWeight: 600 }}>{lawyer.active_case_count} cases</td>
                <td className="team-date">{formatDate(lawyer.last_login_at)}</td>
                <td style={{ fontSize: '12px' }}>{lawyer.last_action}</td>
                <td>
                  <span className={`badge ${lawyer.status === 'active' ? 'badge--active' : 'badge--expired'}`}>
                    {lawyer.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {lawyerSummaries.length === 0 && (
              <tr>
                <td colSpan={6} className="team-empty">No lawyers registered in this firm.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── LOGIN AUDIT & LIVE ACTIVITY FEED ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Real-time Activity Feed */}
        <RealtimeActivityFeed initialActivities={initialActivities} firmId={firmId} />

        {/* Login Audit Panel */}
        <div className="profile-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 className="profile-card-title" style={{ margin: 0 }}>Login Audit Panel</h2>
            <input
              type="text"
              placeholder="Search user / IP..."
              className="form-input"
              style={{ width: '160px', padding: '4px 8px', fontSize: '12px' }}
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredAuditEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: '10px 12px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                    {ev.user_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    IP: {ev.ip_address} • {ev.device}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className={`badge ${ev.success ? 'badge--active' : 'badge--urgent'}`}>
                    {ev.success ? 'Success' : 'FAILED'}
                  </span>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {formatDate(ev.created_at)}
                  </div>
                </div>
              </div>
            ))}
            {filteredAuditEvents.length === 0 && (
              <p className="team-empty">No login audit events match search query.</p>
            )}
          </div>
        </div>
      </div>

      {/* Lawyer Case Slide-over */}
      {selectedLawyer && (
        <LawyerCaseSlideOver
          lawyerId={selectedLawyer.id}
          lawyerName={selectedLawyer.name}
          onClose={() => setSelectedLawyer(null)}
        />
      )}
    </div>
  )
}
