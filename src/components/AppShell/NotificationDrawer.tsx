'use client'

import { useState } from 'react'
import { markNotificationsRead } from '@/actions/superAdminDashboard'

interface NotificationDrawerProps {
  notifications: any[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotificationDrawer({ notifications }: NotificationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const unreadCount = notifications.filter(n => !n.read).length

  async function handleMarkRead() {
    await markNotificationsRead()
  }

  return (
    <>
      {/* Bell Icon with Badge */}
      <button
        type="button"
        className="topbar-icon-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Notifications"
        style={{ position: 'relative' }}
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
          <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {/* Notification Slide-Over Drawer */}
      {isOpen && (
        <div className="modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '420px',
              height: '100vh',
              margin: '0 0 0 auto',
              borderRadius: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Notifications</h2>
                <span className="profile-hint">{unreadCount} unread alerts</span>
              </div>
              <button className="modal-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            <div style={{ padding: '8px 16px', borderBottom: '0.5px solid var(--color-border)', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleMarkRead}
                disabled={unreadCount === 0}
              >
                Mark all as read
              </button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <p className="team-empty">No notifications yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: '12px',
                        background: n.read ? 'transparent' : 'var(--color-surface)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        borderLeft: n.read ? '0.5px solid var(--color-border)' : '3px solid var(--color-primary)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{n.event_type}</span>
                        <span>{formatDate(n.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
