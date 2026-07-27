'use client'

import React, { useState, useTransition } from 'react'
import { ActivityLog } from '@/components/Cases/ActivityLog'
import { DocumentHub } from '@/components/Cases/DocumentHub'
import { TimerWidget } from '@/components/Cases/TimerWidget'
import { TimeLog } from '@/components/Cases/TimeLog'
import { InvoiceBuilderModal } from '@/components/Billing/InvoiceBuilderModal'
import { createCaseEvent, createCaseNote } from '@/actions/collaboration'
import { Button } from '@/components/ui/Button'
import type { CaseStatus, TimeEntryRow } from '@/types/database.types'

interface AuditLogEntry {
  id: string
  action: string
  payload: any
  created_at: string
  actor: { full_name: string } | null
}

interface Staff {
  id: string
  full_name: string
}

interface CaseDocument {
  id: string
  filename: string
  tag: string | null
  visible_to_client: boolean
  created_at: string
  uploaded_by_name: string | null
}

interface CaseNote {
  id: string
  body: string
  created_at: string
  author_name: string
}

interface CaseEvent {
  id: string
  title: string
  event_date: string
  visible_to_client: boolean
  created_at: string
}

interface CaseDetailTabsProps {
  caseData: {
    id: string
    title: string
    status: CaseStatus
    matter_type: string
    created_at: string
    updated_at: string
    client: { id?: string; name: string } | null
    assigned_user: { full_name: string } | null
  }
  logs: AuditLogEntry[]
  staffList: Staff[]
  documents: CaseDocument[]
  role: 'firm_admin' | 'attorney' | 'staff' | 'client'
  notes: CaseNote[]
  events: CaseEvent[]
  timeEntries?: TimeEntryRow[]
  timeTotals?: {
    totalHours: number
    totalBillableAmount: number
    totalUnbilledAmount: number
    unbilledHours: number
  }
  currentUserId?: string
}

type TabType = 'overview' | 'activity' | 'documents' | 'notes' | 'time'

export function CaseDetailTabs({
  caseData,
  logs,
  staffList,
  documents,
  role,
  notes,
  events,
  timeEntries = [],
  timeTotals = { totalHours: 0, totalBillableAmount: 0, totalUnbilledAmount: 0, unbilledHours: 0 },
  currentUserId,
}: CaseDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [timerDuration, setTimerDuration] = useState<number | null>(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [isNotePending, startNoteTransition] = useTransition()
  const [isEventPending, startEventTransition] = useTransition()
  const [noteError, setNoteError] = useState('')

  const canLogTime = role === 'attorney'

  function handleTimerStop(elapsedMinutes: number) {
    setTimerDuration(elapsedMinutes)
    setActiveTab('time')
  }
  const [eventError, setEventError] = useState('')

  const handleAddNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setNoteError('')
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.append('case_id', caseData.id)

    startNoteTransition(async () => {
      try {
        await createCaseNote(formData)
        form.reset()
      } catch (err: any) {
        setNoteError(err.message || 'Failed to add note.')
      }
    })
  }

  const handleAddEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setEventError('')
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.append('case_id', caseData.id)

    const checkbox = form.querySelector('input[name="visible_to_client_checkbox"]') as HTMLInputElement
    formData.append('visible_to_client', checkbox?.checked ? 'true' : 'false')

    startEventTransition(async () => {
      try {
        await createCaseEvent(formData)
        form.reset()
      } catch (err: any) {
        setEventError(err.message || 'Failed to schedule event.')
      }
    })
  }

  const formatEventDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div>
      {/* Tabs list */}
      <div className="case-tabs" role="tablist" aria-label="Case navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'overview'}
          aria-controls="panel-overview"
          id="tab-overview"
          className={`case-tab btn--ghost ${activeTab === 'overview' ? 'case-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'activity'}
          aria-controls="panel-activity"
          id="tab-activity"
          className={`case-tab btn--ghost ${activeTab === 'activity' ? 'case-tab--active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity Log
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'documents'}
          aria-controls="panel-documents"
          id="tab-documents"
          className={`case-tab btn--ghost ${activeTab === 'documents' ? 'case-tab--active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'notes'}
          aria-controls="panel-notes"
          id="tab-notes"
          className={`case-tab btn--ghost ${activeTab === 'notes' ? 'case-tab--active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
        {role !== 'client' && (
          <button
            role="tab"
            aria-selected={activeTab === 'time'}
            aria-controls="panel-time"
            id="tab-time"
            className={`case-tab btn--ghost ${activeTab === 'time' ? 'case-tab--active' : ''}`}
            onClick={() => setActiveTab('time')}
          >
            Time & Billing
          </button>
        )}
      </div>

      {/* Floating Timer Widget for Attorneys */}
      {canLogTime && (
        <div style={{ marginBottom: '16px' }}>
          <TimerWidget
            caseId={caseData.id}
            caseTitle={caseData.title}
            onTimerStop={handleTimerStop}
          />
        </div>
      )}

      {/* Tab Panels */}
      
      {/* Overview Panel */}
      <div
        id="panel-overview"
        role="tabpanel"
        aria-labelledby="tab-overview"
        hidden={activeTab !== 'overview'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="case-info-card">
            <h3 className="case-info-card-title">Case Overview</h3>
            <div className="case-info-row">
              <span className="case-info-row-label">Client Name</span>
              <span className="case-info-row-value">{caseData.client?.name ?? '—'}</span>
            </div>
            <div className="case-info-row">
              <span className="case-info-row-label">Matter Type</span>
              <span className="case-info-row-value">{caseData.matter_type}</span>
            </div>
            <div className="case-info-row">
              <span className="case-info-row-label">Assigned Attorney</span>
              <span className="case-info-row-value">{caseData.assigned_user?.full_name ?? 'Unassigned'}</span>
            </div>
            <div className="case-info-row">
              <span className="case-info-row-label">Status</span>
              <span className="case-info-row-value" style={{ textTransform: 'capitalize' }}>
                {caseData.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Key Dates (Events) List */}
          <div className="case-info-card" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h3 className="case-info-card-title">Scheduled Court Dates & Deadlines</h3>
              {events.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.75rem', fontStyle: 'italic' }}>
                  No dates scheduled yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                  {events.map((evt) => (
                    <div
                      key={evt.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.625rem 0.875rem',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>{evt.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                          {formatEventDate(evt.event_date)}
                        </div>
                      </div>
                      <span className={`badge ${evt.visible_to_client ? 'badge--active' : 'badge--closed'}`} style={{ fontSize: '0.65rem' }}>
                        {evt.visible_to_client ? 'Shared' : 'Private'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Event Form */}
            {role !== 'client' && (
              <form onSubmit={handleAddEvent} className="form-card" style={{ flex: '0 0 280px', padding: '1rem', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <h4 className="case-info-card-title" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Schedule Date / Deadline</h4>
                {eventError && <div className="form-error" style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>{eventError}</div>}
                
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="evt-title" className="form-label" style={{ fontSize: '0.75rem' }}>Title</label>
                  <input id="evt-title" name="title" type="text" className="form-input" placeholder="e.g. Trial Hearing" required disabled={isEventPending} style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} />
                </div>

                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="evt-date" className="form-label" style={{ fontSize: '0.75rem' }}>Event Date</label>
                  <input id="evt-date" name="event_date" type="date" className="form-input" required disabled={isEventPending} style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input id="evt-visible" name="visible_to_client_checkbox" type="checkbox" disabled={isEventPending} style={{ cursor: 'pointer', width: '15px', height: '15px' }} />
                  <label htmlFor="evt-visible" className="form-label" style={{ margin: 0, fontSize: '0.75rem', cursor: 'pointer' }}>Share with Client</label>
                </div>

                <Button type="submit" variant="primary" size="sm" disabled={isEventPending} style={{ width: '100%' }}>
                  {isEventPending ? 'Scheduling...' : 'Add Date'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Activity Log Panel */}
      <div
        id="panel-activity"
        role="tabpanel"
        aria-labelledby="tab-activity"
        hidden={activeTab !== 'activity'}
      >
        <div className="case-info-card">
          <h3 className="case-info-card-title" style={{ marginBottom: '1.25rem' }}>History & Activity feed</h3>
          <ActivityLog logs={logs} staffList={staffList} />
        </div>
      </div>

      {/* Documents Panel */}
      <div
        id="panel-documents"
        role="tabpanel"
        aria-labelledby="tab-documents"
        hidden={activeTab !== 'documents'}
      >
        <DocumentHub caseId={caseData.id} documents={documents} role={role} />
      </div>

      {/* Internal Notes Panel */}
      <div
        id="panel-notes"
        role="tabpanel"
        aria-labelledby="tab-notes"
        hidden={activeTab !== 'notes'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {role !== 'client' && (
            <form onSubmit={handleAddNote} className="form-card" style={{ padding: '1.25rem' }}>
              <h3 className="case-info-card-title" style={{ marginBottom: '0.75rem' }}>Write Internal Case Note</h3>
              {noteError && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{noteError}</div>}
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <textarea
                  id="note-body"
                  name="body"
                  className="form-input"
                  placeholder="Type internal note details here... (invisible to client)"
                  required
                  rows={3}
                  disabled={isNotePending}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" disabled={isNotePending}>
                  {isNotePending ? 'Saving note...' : 'Save Internal Note'}
                </Button>
              </div>
            </form>
          )}

          <div className="case-info-card">
            <h3 className="case-info-card-title" style={{ marginBottom: '1.25rem' }}>Notes Feed</h3>
            
            {notes.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem 0' }}>
                No internal notes have been written for this case.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {notes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      padding: '1rem 1.25rem',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{note.author_name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {formatEventDate(note.created_at)} at {new Date(note.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {note.body}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time & Billing Panel */}
      {role !== 'client' && (
        <div
          id="panel-time"
          role="tabpanel"
          aria-labelledby="tab-time"
          hidden={activeTab !== 'time'}
        >
          {['attorney', 'firm_admin', 'super_admin'].includes(role) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                type="button"
                className="btn btn--primary btn--md"
                onClick={() => setIsInvoiceModalOpen(true)}
              >
                📄 Generate Invoice
              </button>
            </div>
          )}

          <TimeLog
            caseId={caseData.id}
            entries={timeEntries}
            totals={timeTotals}
            userRole={role}
            currentUserId={currentUserId}
            initialTimerDuration={timerDuration}
          />

          {isInvoiceModalOpen && (
            <InvoiceBuilderModal
              caseId={caseData.id}
              clientId={caseData.client?.id || ''}
              clientName={caseData.client?.name || 'Client'}
              caseTitle={caseData.title}
              onClose={() => setIsInvoiceModalOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
