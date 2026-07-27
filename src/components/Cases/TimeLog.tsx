'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createTimeEntry, updateTimeEntry, deleteTimeEntry, getDefaultHourlyRate } from '@/actions/timeTracking'
import type { TimeEntryRow } from '@/types/database.types'

interface TimeLogProps {
  caseId: string
  entries: TimeEntryRow[]
  totals: {
    totalHours: number
    totalBillableAmount: number
    totalUnbilledAmount: number
    unbilledHours: number
  }
  userRole: 'firm_admin' | 'attorney' | 'staff' | 'client'
  currentUserId?: string
  initialTimerDuration?: number | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)
}

export function TimeLog({
  caseId,
  entries,
  totals,
  userRole,
  currentUserId,
  initialTimerDuration,
}: TimeLogProps) {
  const router = useRouter()
  const canLogTime = ['attorney', 'firm_admin'].includes(userRole)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntryRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form values
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [hourlyRate, setHourlyRate] = useState(0)
  const [isBillable, setIsBillable] = useState(true)
  const [description, setDescription] = useState('')

  // Pre-fill rate on load
  useEffect(() => {
    async function loadRate() {
      const rate = await getDefaultHourlyRate()
      setHourlyRate(rate)
    }
    loadRate()
  }, [])

  // Auto-open modal if triggered from timer widget
  useEffect(() => {
    if (initialTimerDuration && initialTimerDuration > 0) {
      const h = Math.floor(initialTimerDuration / 60)
      const m = initialTimerDuration % 60
      setHours(h)
      setMinutes(m)
      setEntryDate(new Date().toISOString().split('T')[0])
      setIsModalOpen(true)
    }
  }, [initialTimerDuration])

  function handleOpenCreateModal() {
    setEditingEntry(null)
    setEntryDate(new Date().toISOString().split('T')[0])
    setHours(0)
    setMinutes(0)
    setIsBillable(true)
    setDescription('')
    setErrorMsg('')
    setIsModalOpen(true)
  }

  function handleOpenEditModal(entry: TimeEntryRow) {
    if (entry.invoice_id) return // Billed entries are locked
    setEditingEntry(entry)
    setEntryDate(entry.entry_date)
    setHours(Math.floor(entry.duration_minutes / 60))
    setMinutes(entry.duration_minutes % 60)
    setHourlyRate(entry.hourly_rate)
    setIsBillable(entry.is_billable)
    setDescription(entry.description)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const computedAmount = isBillable ? (((hours * 60 + minutes) / 60) * hourlyRate) : 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    const formData = new FormData()
    formData.append('case_id', caseId)
    formData.append('entry_date', entryDate)
    formData.append('duration_hours', hours.toString())
    formData.append('duration_minutes', minutes.toString())
    formData.append('hourly_rate', hourlyRate.toString())
    formData.append('is_billable', isBillable ? 'true' : 'false')
    formData.append('description', description)

    let res
    if (editingEntry) {
      res = await updateTimeEntry(editingEntry.id, formData)
    } else {
      res = await createTimeEntry(formData)
    }

    setLoading(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save time entry.')
    } else {
      setIsModalOpen(false)
      router.refresh()
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm('Are you sure you want to delete this time entry?')) return
    const res = await deleteTimeEntry(entryId)
    if (!res.success) {
      alert(res.error || 'Failed to delete entry.')
    } else {
      router.refresh()
    }
  }

  return (
    <div className="time-log-section">
      {/* Running Totals Summary */}
      <div className="sa-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
        <div className="sa-stat-card">
          <span className="sa-stat-label">Total Hours Logged</span>
          <span className="sa-stat-value">{totals.totalHours} hrs</span>
          <span className="sa-stat-sub">Across all attorneys on this case</span>
        </div>
        <div className="sa-stat-card">
          <span className="sa-stat-label">Total Billable Amount</span>
          <span className="sa-stat-value" style={{ color: 'var(--color-primary)' }}>
            {formatCurrency(totals.totalBillableAmount)}
          </span>
          <span className="sa-stat-sub">Calculated billable value</span>
        </div>
        <div className="sa-stat-card">
          <span className="sa-stat-label">Unbilled Amount</span>
          <span className="sa-stat-value" style={{ color: '#D97706' }}>
            {formatCurrency(totals.totalUnbilledAmount)}
          </span>
          <span className="sa-stat-sub">{totals.unbilledHours} hrs pending invoice</span>
        </div>
      </div>

      {/* Header & Log Button */}
      <div className="team-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Case Time Log</h2>
          <p className="profile-hint">Chronological time entries for this matter</p>
        </div>

        {canLogTime && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleOpenCreateModal}
          >
            + Log Time Entry
          </button>
        )}
      </div>

      {/* Time Entries Table */}
      <div className="team-table-wrapper">
        <table className="team-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Attorney</th>
              <th>Description</th>
              <th>Duration</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Billable</th>
              <th>Status</th>
              {canLogTime && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const amount = entry.is_billable ? (entry.duration_minutes / 60) * entry.hourly_rate : 0
              const isBilled = Boolean(entry.invoice_id)
              const isOwnerOrAdmin = userRole === 'firm_admin' || entry.user_id === currentUserId

              return (
                <tr key={entry.id}>
                  <td className="team-date">{formatDate(entry.entry_date)}</td>
                  <td>
                    <div className="team-member-cell">
                      <div className="avatar-sm">
                        {entry.user?.avatar_signed_url ? (
                          <img src={entry.user.avatar_signed_url} alt="" className="avatar-img" />
                        ) : (
                          <span className="avatar-fallback">{entry.user?.full_name?.charAt(0) || 'A'}</span>
                        )}
                      </div>
                      <span className="team-member-name">{entry.user?.full_name || 'Attorney'}</span>
                    </div>
                  </td>
                  <td style={{ maxWidth: '280px', whiteSpace: 'normal' }}>{entry.description}</td>
                  <td style={{ fontWeight: 600 }}>{formatDuration(entry.duration_minutes)}</td>
                  <td>{formatCurrency(entry.hourly_rate)}/hr</td>
                  <td style={{ fontWeight: 600, color: entry.is_billable ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {entry.is_billable ? formatCurrency(amount) : '₦0.00'}
                  </td>
                  <td>
                    {entry.is_billable ? (
                      <span className="badge badge--active">Billable</span>
                    ) : (
                      <span className="badge badge--staff">Non-billable</span>
                    )}
                  </td>
                  <td>
                    {isBilled ? (
                      <span className="badge badge--admin">Billed</span>
                    ) : (
                      <span className="badge badge--pending">Unbilled</span>
                    )}
                  </td>
                  {canLogTime && (
                    <td>
                      <div className="team-actions">
                        {isBilled ? (
                          <span className="profile-hint" style={{ fontSize: '11px' }}>Locked</span>
                        ) : (
                          isOwnerOrAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => handleOpenEditModal(entry)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm btn--danger-ghost"
                                onClick={() => handleDelete(entry.id)}
                              >
                                Delete
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={canLogTime ? 9 : 8} className="team-empty">
                  No time entries logged for this case yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT TIME ENTRY MODAL */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingEntry ? 'Edit Time Entry' : 'Log Time Entry'}
              </h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {errorMsg && (
                  <div className="team-error" style={{ marginBottom: '16px' }}>{errorMsg}</div>
                )}

                <div className="form-group">
                  <label htmlFor="time-entry-date" className="form-label">Date</label>
                  <input
                    id="time-entry-date"
                    type="date"
                    className="form-input"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="time-entry-hours" className="form-label">Hours</label>
                    <input
                      id="time-entry-hours"
                      type="number"
                      min="0"
                      max="24"
                      className="form-input"
                      value={hours}
                      onChange={(e) => setHours(parseInt(e.target.value || '0', 10))}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="time-entry-minutes" className="form-label">Minutes</label>
                    <input
                      id="time-entry-minutes"
                      type="number"
                      min="0"
                      max="59"
                      className="form-input"
                      value={minutes}
                      onChange={(e) => setMinutes(parseInt(e.target.value || '0', 10))}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="time-entry-rate" className="form-label">Hourly Rate (₦)</label>
                    <input
                      id="time-entry-rate"
                      type="number"
                      min="0"
                      step="1000"
                      className="form-input"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(parseFloat(e.target.value || '0'))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Computed Amount</label>
                    <div className="form-input" style={{ background: 'var(--color-surface)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                      {formatCurrency(computedAmount)}
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ margin: '12px 0' }}>
                  <label className="profile-toggle-label">
                    <input
                      type="checkbox"
                      checked={isBillable}
                      onChange={(e) => setIsBillable(e.target.checked)}
                    />
                    <span>Is Billable</span>
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="time-entry-desc" className="form-label">Description / Work Completed</label>
                  <textarea
                    id="time-entry-desc"
                    className="form-input profile-textarea"
                    placeholder="Provide details of legal work completed…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  {loading ? 'Saving…' : (editingEntry ? 'Update Entry' : 'Save Entry')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
