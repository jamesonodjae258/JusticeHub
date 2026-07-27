'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FirmAdminCaseItem,
  FirmAdminTeamItem,
  FirmAdminActivityItem,
  reassignCaseLawyer,
} from '@/actions/firmAdminDashboard'

interface FirmAdminOverviewProps {
  stats: {
    totalCases: number
    activeLawyers: number
    portalClients: number
    pendingInvoices: number
  }
  casesList: FirmAdminCaseItem[]
  teamList: FirmAdminTeamItem[]
  caseActivities: FirmAdminActivityItem[]
  activeLawyersList: Array<{ id: string; full_name: string }>
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function FirmAdminOverview({
  stats,
  casesList,
  teamList,
  caseActivities,
  activeLawyersList,
}: FirmAdminOverviewProps) {
  const router = useRouter()

  // Filters for Case List
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [lawyerFilter, setLawyerFilter] = useState<string>('all')

  // Filter for Activity Feed
  const [activityTab, setActivityTab] = useState<'all' | 'case' | 'document' | 'client'>('all')

  const [loadingCaseId, setLoadingCaseId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Reassign Case Lawyer ──
  async function handleReassign(caseId: string, newLawyerId: string) {
    setMsg(null)
    setLoadingCaseId(caseId)

    const res = await reassignCaseLawyer(caseId, newLawyerId)
    setLoadingCaseId(null)

    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Failed to reassign lawyer.' })
    } else {
      setMsg({ type: 'success', text: 'Case lawyer reassigned successfully!' })
      router.refresh()
    }
  }

  const filteredCases = casesList.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (lawyerFilter !== 'all' && c.assigned_lawyer_id !== lawyerFilter) return false
    return true
  })

  const filteredActivities = caseActivities.filter(a => {
    if (activityTab === 'all') return true
    return a.entity_type === activityTab
  })

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Firm Admin Dashboard</h1>
          <p className="page-subtitle">Overview of firm cases, lawyer assignments, team roster, and case activity</p>
        </div>
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* ── TOP STATS ROW (4 CARDS) ── */}
      <div className="stats-row" style={{ marginBottom: '28px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Firm Cases</div>
          <div className="stat-value">{stats.totalCases}</div>
          <div className="stat-hint">Active & closed matters</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Lawyers</div>
          <div className="stat-value">{stats.activeLawyers}</div>
          <div className="stat-hint">Attorneys on firm roster</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Portal Clients</div>
          <div className="stat-value">{stats.portalClients}</div>
          <div className="stat-hint">Clients with portal access</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending Time Entries</div>
          <div className="stat-value">{stats.pendingInvoices}</div>
          <div className="stat-hint">Unbilled time items</div>
        </div>
      </div>

      {/* ── CASE LIST WITH LAWYER REASSIGNMENT ── */}
      <div className="team-table-wrapper" style={{ marginBottom: '28px' }}>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--color-border)' }}>
          <h2 className="profile-card-title" style={{ margin: 0, fontSize: '15px' }}>
            Firm Case Roster ({filteredCases.length})
          </h2>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Status Filter */}
            <select
              className="form-input"
              style={{ width: '140px', padding: '4px 8px', fontSize: '12px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="Intake">Intake</option>
              <option value="Active">Active</option>
              <option value="Awaiting Court">Awaiting Court</option>
              <option value="Closed">Closed</option>
            </select>

            {/* Lawyer Filter */}
            <select
              className="form-input"
              style={{ width: '160px', padding: '4px 8px', fontSize: '12px' }}
              value={lawyerFilter}
              onChange={(e) => setLawyerFilter(e.target.value)}
            >
              <option value="all">All Lawyers</option>
              {activeLawyersList.map(l => (
                <option key={l.id} value={l.id}>{l.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <table className="team-table">
          <thead>
            <tr>
              <th>Case Name</th>
              <th>Client</th>
              <th>Status</th>
              <th>Assigned Lawyer</th>
              <th>Last Updated</th>
              <th>Reassign Lawyer</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/cases/${c.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {c.title}
                  </Link>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{c.matter_type}</div>
                </td>
                <td>{c.client_name || <span className="profile-hint">Unassigned</span>}</td>
                <td><span className="badge badge--active">{c.status}</span></td>
                <td>
                  <div className="team-member-cell">
                    <div className="avatar-sm" style={{ width: '24px', height: '24px', fontSize: '11px' }}>
                      {c.assigned_lawyer_avatar_signed_url ? (
                        <img src={c.assigned_lawyer_avatar_signed_url} alt="" className="avatar-img" />
                      ) : (
                        <span className="avatar-fallback">{c.assigned_lawyer_name?.charAt(0) || 'L'}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '13px' }}>{c.assigned_lawyer_name || 'Unassigned'}</span>
                  </div>
                </td>
                <td className="team-date">{formatDate(c.updated_at)}</td>
                <td>
                  <select
                    className="form-input"
                    style={{ padding: '4px 6px', fontSize: '12px', width: '150px' }}
                    defaultValue={c.assigned_lawyer_id || ''}
                    disabled={loadingCaseId === c.id}
                    onChange={(e) => handleReassign(c.id, e.target.value)}
                  >
                    <option value="">-- Unassign --</option>
                    {activeLawyersList.map(l => (
                      <option key={l.id} value={l.id}>{l.full_name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {filteredCases.length === 0 && (
              <tr>
                <td colSpan={6} className="team-empty">No firm cases match the selected filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── TEAM PANEL & CASE ACTIVITY FEED ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Privacy-Preserving Team Panel */}
        <div className="team-table-wrapper" style={{ border: 'none' }}>
          <h2 className="profile-card-title" style={{ padding: '16px 20px 0 20px', fontSize: '15px' }}>
            Team Roster ({teamList.length})
          </h2>
          <table className="team-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Assigned Cases</th>
                <th>Last Active Date</th>
              </tr>
            </thead>
            <tbody>
              {teamList.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="team-member-cell">
                      <div className="avatar-sm">
                        {member.avatar_signed_url ? (
                          <img src={member.avatar_signed_url} alt="" className="avatar-img" />
                        ) : (
                          <span className="avatar-fallback">{member.full_name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="team-member-name">{member.full_name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge--active">{member.role.toUpperCase()}</span></td>
                  <td style={{ fontWeight: 600 }}>{member.assigned_case_count} cases</td>
                  <td className="team-date">{member.last_active_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Case-Level Activity Feed (NO Login Events) */}
        <div className="profile-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="profile-card-title" style={{ margin: 0 }}>
              Case Activity Feed
            </h2>

            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'case', 'document', 'client'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`btn btn--sm ${activityTab === tab ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setActivityTab(tab)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {tab === 'all' ? 'All' : tab + 's'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredActivities.map((act) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge--active">{act.action}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {act.actor_name}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Record: {act.entity_name}
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {formatDate(act.created_at)}
                </div>
              </div>
            ))}

            {filteredActivities.length === 0 && (
              <p className="team-empty">No case activity events found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
