'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { suspendFirm, reinstateFirm, deleteFirm } from '@/actions/superadmin'

interface FirmItem {
  id: string
  name: string
  slug: string
  plan_tier: string
  status: string
  created_at: string
  memberCount: number
  caseCount: number
}

interface FirmsTableProps {
  firms: FirmItem[]
  initialQuery?: string
  initialStatus?: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function FirmsTable({ firms, initialQuery = '', initialStatus = 'all' }: FirmsTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialQuery)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // Modals state
  const [statsTarget, setStatsTarget] = useState<FirmItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FirmItem | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState('')

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
    router.push(`/superadmin/firms?${params.toString()}`)
  }

  async function handleSuspend(firmId: string) {
    if (!confirm('Suspend this firm? All firm members will be locked out immediately.')) return
    setLoadingId(firmId)
    setMsg(null)
    const res = await suspendFirm(firmId)
    setLoadingId(null)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Firm suspended successfully.' })
      router.refresh()
    }
  }

  async function handleReinstate(firmId: string) {
    setLoadingId(firmId)
    setMsg(null)
    const res = await reinstateFirm(firmId)
    setLoadingId(null)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Firm reinstated successfully.' })
      router.refresh()
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!deleteTarget) return
    setLoadingId(deleteTarget.id)
    setMsg(null)
    const res = await deleteFirm(deleteTarget.id, confirmDeleteName)
    setLoadingId(null)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: `Firm ${deleteTarget.name} deleted. Export email dispatched.` })
      setDeleteTarget(null)
      setConfirmDeleteName('')
      router.refresh()
    }
  }

  return (
    <div>
      {/* Search & Filter Bar */}
      <form onSubmit={handleSearchSubmit} className="filters-bar" style={{ marginBottom: '20px' }}>
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: '300px' }}
          placeholder="Search by firm name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit" className="btn btn--secondary btn--sm">Filter</button>
      </form>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* Firms Table */}
      <div className="team-table-wrapper">
        <table className="team-table">
          <thead>
            <tr>
              <th>Firm Name</th>
              <th>Plan</th>
              <th>Members</th>
              <th>Cases</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {firms.map((firm) => (
              <tr key={firm.id}>
                <td style={{ fontWeight: 600 }}>{firm.name}</td>
                <td>
                  <span className="badge badge--admin">{firm.plan_tier || 'Free'}</span>
                </td>
                <td>{firm.memberCount}</td>
                <td>{firm.caseCount}</td>
                <td className="team-date">{formatDate(firm.created_at)}</td>
                <td>
                  {firm.status === 'suspended' ? (
                    <span className="badge badge--expired">Suspended</span>
                  ) : (
                    <span className="badge badge--active">Active</span>
                  )}
                </td>
                <td>
                  <div className="team-actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setStatsTarget(firm)}
                      title="View Stats"
                    >
                      Stats
                    </button>

                    {firm.status === 'suspended' ? (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleReinstate(firm.id)}
                        disabled={loadingId === firm.id}
                      >
                        Reinstate
                      </button>
                    ) : (
                      <button
                        className="btn btn--ghost btn--sm btn--danger-ghost"
                        onClick={() => handleSuspend(firm.id)}
                        disabled={loadingId === firm.id}
                      >
                        Suspend
                      </button>
                    )}

                    <button
                      className="btn btn--ghost btn--sm btn--danger-ghost"
                      onClick={() => {
                        setDeleteTarget(firm)
                        setConfirmDeleteName('')
                      }}
                      disabled={loadingId === firm.id}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {firms.length === 0 && (
              <tr>
                <td colSpan={7} className="team-empty">No matching firms found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stats Modal */}
      {statsTarget && (
        <div className="modal-backdrop" onClick={() => setStatsTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Firm Statistics: {statsTarget.name}</h2>
              <button className="modal-close" onClick={() => setStatsTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="sa-stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="sa-stat-card">
                  <span className="sa-stat-label">Plan Tier</span>
                  <span className="sa-stat-value" style={{ fontSize: '18px' }}>{statsTarget.plan_tier}</span>
                </div>
                <div className="sa-stat-card">
                  <span className="sa-stat-label">Status</span>
                  <span className="sa-stat-value" style={{ fontSize: '18px' }}>{statsTarget.status}</span>
                </div>
                <div className="sa-stat-card">
                  <span className="sa-stat-label">Team Members</span>
                  <span className="sa-stat-value" style={{ fontSize: '18px' }}>{statsTarget.memberCount}</span>
                </div>
                <div className="sa-stat-card">
                  <span className="sa-stat-label">Total Cases</span>
                  <span className="sa-stat-value" style={{ fontSize: '18px' }}>{statsTarget.caseCount}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn--ghost" onClick={() => setStatsTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Firm Modal */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-danger)' }}>Delete Firm: {deleteTarget.name}</h2>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <form onSubmit={handleDelete}>
              <div className="modal-body">
                <p className="profile-hint" style={{ color: '#991B1B', marginBottom: '16px' }}>
                  ⚠️ Deleting this firm will trigger an automated data export summary email to the Firm Admin and permanently purge all firm records.
                </p>

                <div className="form-group">
                  <label className="form-label">
                    Type exact firm name <strong>{deleteTarget.name}</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={deleteTarget.name}
                    value={confirmDeleteName}
                    onChange={(e) => setConfirmDeleteName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn--danger"
                  disabled={confirmDeleteName.trim() !== deleteTarget.name.trim() || loadingId === deleteTarget.id}
                >
                  Confirm & Delete Firm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
