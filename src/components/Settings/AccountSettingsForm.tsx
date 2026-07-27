'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateDisplayName,
  updateEmail,
  updatePassword,
  enroll2FA,
  verify2FA,
  disable2FA,
  updateNotificationPreferences,
  deleteAccount,
} from '@/actions/accountSettings'
import type { NotificationPreferences, ProfileRow } from '@/types/database.types'

interface AccountSettingsFormProps {
  initialDisplayName: string
  userEmail: string
  userRole: string
  twoFactorStatus: { enabled: boolean; factorId?: string }
  profile: any
}

type TabType = 'account' | 'notifications' | 'appearance'

const DEFAULT_NOTIFS: NotificationPreferences = {
  case_status: { email: true, in_app: true },
  doc_upload:  { email: true, in_app: true },
  court_dates: { email: true, in_app: true },
  assignments: { email: true, in_app: true },
  billing:     { email: true, in_app: true },
  e_signature: { email: true, in_app: true },
}

export function AccountSettingsForm({
  initialDisplayName,
  userEmail,
  userRole,
  twoFactorStatus,
  profile,
}: AccountSettingsFormProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('account')

  // Status state
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Account section states
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Email form
  const [emailCurrentPass, setEmailCurrentPass] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Password form
  const [passCurrent, setPassCurrent] = useState('')
  const [passNew, setPassNew] = useState('')
  const [passConfirm, setPassConfirm] = useState('')

  // 2FA state
  const [mfaStatus, setMfaStatus] = useState(twoFactorStatus)
  const [mfaEnrollData, setMfaEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  // Delete account form
  const [deletePass, setDeletePass] = useState('')
  const [deleteText, setDeleteText] = useState('')

  // Notifications state
  const initialNotifs: NotificationPreferences = (profile?.notification_preferences as NotificationPreferences) || DEFAULT_NOTIFS
  const [notifs, setNotifs] = useState<NotificationPreferences>({
    case_status: { email: initialNotifs.case_status?.email ?? true, in_app: initialNotifs.case_status?.in_app ?? true },
    doc_upload:  { email: initialNotifs.doc_upload?.email ?? true, in_app: initialNotifs.doc_upload?.in_app ?? true },
    court_dates: { email: initialNotifs.court_dates?.email ?? true, in_app: initialNotifs.court_dates?.in_app ?? true },
    assignments: { email: initialNotifs.assignments?.email ?? true, in_app: initialNotifs.assignments?.in_app ?? true },
    billing:     { email: initialNotifs.billing?.email ?? true, in_app: initialNotifs.billing?.in_app ?? true },
    e_signature: { email: initialNotifs.e_signature?.email ?? true, in_app: initialNotifs.e_signature?.in_app ?? true },
  })

  // Handlers
  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    const res = await updateDisplayName(displayName)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Display name updated!' })
      router.refresh()
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    const res = await updateEmail(emailCurrentPass, newEmail)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Verification email sent to new address. Click the link to apply changes.' })
      setShowEmailModal(false)
      setEmailCurrentPass('')
      setNewEmail('')
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    if (passNew !== passConfirm) {
      setMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }

    setLoading(true)
    const res = await updatePassword(passCurrent, passNew)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Password updated successfully!' })
      setShowPassModal(false)
      setPassCurrent('')
      setPassNew('')
      setPassConfirm('')
    }
  }

  async function handleEnroll2FA() {
    setMsg(null)
    setLoading(true)
    const res = await enroll2FA()
    setLoading(false)
    if (res.error || !res.factorId || !res.qrCode || !res.secret) {
      setMsg({ type: 'error', text: res.error ?? '2FA enrollment failed.' })
    } else {
      setMfaEnrollData({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret })
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaEnrollData) return
    setMsg(null)
    setLoading(true)
    const res = await verify2FA(mfaEnrollData.factorId, mfaCode)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: '2FA enabled successfully!' })
      setMfaStatus({ enabled: true, factorId: mfaEnrollData.factorId })
      setMfaEnrollData(null)
      setMfaCode('')
    }
  }

  async function handleDisable2FA() {
    if (!mfaStatus.factorId) return
    if (!confirm('Are you sure you want to disable 2-Factor Authentication?')) return
    setMsg(null)
    setLoading(true)
    const res = await disable2FA(mfaStatus.factorId)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: '2FA disabled.' })
      setMfaStatus({ enabled: false })
    }
  }

  function handleNotifToggle(eventKey: keyof NotificationPreferences, channel: 'email' | 'in_app') {
    const current = notifs[eventKey] ?? { email: true, in_app: true }
    const updated = {
      ...notifs,
      [eventKey]: {
        ...current,
        [channel]: !current[channel],
      },
    }
    setNotifs(updated)
  }

  async function handleSaveNotifs() {
    setMsg(null)
    setLoading(true)
    const res = await updateNotificationPreferences(notifs)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Notification preferences saved!' })
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    const res = await deleteAccount(deletePass, deleteText)
    setLoading(false)
    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      router.push('/auth/login')
    }
  }

  return (
    <div className="settings-container">
      {/* Settings Navigation Tabs */}
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === 'account' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'notifications' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'appearance' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* ── TAB 1: ACCOUNT ──────────────────────────────────── */}
      {activeTab === 'account' && (
        <div className="settings-form-layout">
          {/* Display Name Section */}
          <div className="profile-card">
            <h2 className="profile-card-title">Display Name</h2>
            <form onSubmit={handleUpdateName}>
              <div className="form-group">
                <label htmlFor="account-display-name" className="form-label">Full Name</label>
                <input
                  id="account-display-name"
                  type="text"
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="profile-actions-bar" style={{ marginTop: '14px' }}>
                <button type="submit" className="btn btn--primary btn--sm" disabled={loading}>
                  Update name
                </button>
              </div>
            </form>
          </div>

          {/* Email & Password Credentials Card */}
          <div className="profile-card">
            <h2 className="profile-card-title">Security & Credentials</h2>

            <div className="account-row-item">
              <div>
                <strong>Email Address</strong>
                <p className="profile-hint">{userEmail}</p>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowEmailModal(true)}
              >
                Change email
              </button>
            </div>

            <div className="account-row-item" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '0.5px solid var(--color-border)' }}>
              <div>
                <strong>Password</strong>
                <p className="profile-hint">••••••••••••</p>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowPassModal(true)}
              >
                Change password
              </button>
            </div>
          </div>

          {/* 2FA TOTP Card */}
          <div className="profile-card">
            <h2 className="profile-card-title">2-Factor Authentication (TOTP)</h2>
            <p className="profile-hint" style={{ marginBottom: '16px' }}>
              Add an extra layer of security using Google Authenticator or Authy.
            </p>

            {mfaStatus.enabled ? (
              <div className="account-row-item">
                <div className="mfa-enabled-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                    <path d="M9 12l2 2l4 -4" />
                  </svg>
                  <span>2FA is active on your account</span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--danger-ghost"
                  onClick={handleDisable2FA}
                  disabled={loading}
                >
                  Disable 2FA
                </button>
              </div>
            ) : mfaEnrollData ? (
              <form onSubmit={handleVerify2FA} className="mfa-enroll-box">
                <div className="mfa-qr-wrapper">
                  {/* Render SVG QR Code directly from Supabase Auth */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mfaEnrollData.qrCode} alt="2FA QR Code" className="mfa-qr-img" />
                  <div>
                    <strong>Scan with your Authenticator app</strong>
                    <p className="profile-hint">Manual key: <code>{mfaEnrollData.secret}</code></p>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="mfa-code-input" className="form-label">Enter 6-digit verification code</label>
                  <input
                    id="mfa-code-input"
                    type="text"
                    className="form-input"
                    placeholder="000000"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMfaEnrollData(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary btn--sm" disabled={loading || mfaCode.length < 6}>
                    Verify & Enable
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleEnroll2FA}
                disabled={loading}
              >
                Enable 2FA
              </button>
            )}
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="profile-card danger-card">
            <h2 className="profile-card-title" style={{ color: 'var(--color-danger)' }}>Danger Zone</h2>
            <div className="account-row-item">
              <div>
                <strong style={{ color: 'var(--color-text-primary)' }}>Delete account</strong>
                <p className="profile-hint">
                  Permanently delete your account and remove your profile.
                  {userRole === 'firm_admin' && ' (Firm Admins must have another active admin in the firm).'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: NOTIFICATIONS ───────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="profile-card">
          <h2 className="profile-card-title">Notification Preferences</h2>
          <p className="profile-hint" style={{ marginBottom: '20px' }}>
            Choose how and when JusticeHub notifies you about activity.
          </p>

          <div className="notif-table-wrapper">
            <table className="notif-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th style={{ textAlign: 'center' }}>Email</th>
                  <th style={{ textAlign: 'center' }}>In-App</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'case_status' as const, label: 'Case status updates', desc: 'When a case status moves to a new stage' },
                  { key: 'doc_upload' as const,  label: 'Document uploads', desc: 'When new documents are added to assigned cases' },
                  { key: 'court_dates' as const, label: 'Court dates & deadlines', desc: 'Upcoming hearing reminders and filing dates' },
                  { key: 'assignments' as const, label: 'Case assignments', desc: 'When a case is assigned to you' },
                  { key: 'billing' as const,     label: 'Invoice & billing updates', desc: 'When invoices are generated, viewed, or paid' },
                  { key: 'e_signature' as const, label: 'E-signature updates', desc: 'When signature requests are completed or overdue' },
                ].map(item => (
                  <tr key={item.key}>
                    <td>
                      <div className="notif-label">{item.label}</div>
                      <div className="profile-hint">{item.desc}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className="notif-checkbox"
                        checked={notifs[item.key]?.email ?? true}
                        onChange={() => handleNotifToggle(item.key, 'email')}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className="notif-checkbox"
                        checked={notifs[item.key]?.in_app ?? true}
                        onChange={() => handleNotifToggle(item.key, 'in_app')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="profile-actions-bar" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveNotifs}
              disabled={loading}
            >
              Save notification preferences
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: APPEARANCE ──────────────────────────────── */}
      {activeTab === 'appearance' && (
        <div className="profile-card">
          <h2 className="profile-card-title">Appearance & Theme</h2>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="profile-toggle-label">
              <input type="checkbox" checked disabled />
              <span>Light mode (active default)</span>
            </label>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="profile-toggle-label" style={{ opacity: 0.6 }}>
              <input type="checkbox" disabled />
              <span>Dark mode</span>
            </label>
            <span className="badge badge--muted" style={{ marginLeft: '26px' }}>Coming soon</span>
          </div>

          <div className="form-group" style={{ maxWidth: '280px' }}>
            <label htmlFor="appearance-lang-select" className="form-label">Language</label>
            <select id="appearance-lang-select" className="form-select" defaultValue="en">
              <option value="en">English (default)</option>
              <option value="yo" disabled>Yoruba (Coming soon)</option>
              <option value="ig" disabled>Igbo (Coming soon)</option>
              <option value="ha" disabled>Hausa (Coming soon)</option>
            </select>
          </div>
        </div>
      )}

      {/* ── CHANGE EMAIL MODAL ──────────────────────────────── */}
      {showEmailModal && (
        <div className="modal-backdrop" onClick={() => setShowEmailModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Change Email Address</h2>
              <button className="modal-close" onClick={() => setShowEmailModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateEmail}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={emailCurrentPass}
                    onChange={e => setEmailCurrentPass(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setShowEmailModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  Send verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD MODAL ──────────────────────────── */}
      {showPassModal && (
        <div className="modal-backdrop" onClick={() => setShowPassModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Change Password</h2>
              <button className="modal-close" onClick={() => setShowPassModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdatePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passCurrent}
                    onChange={e => setPassCurrent(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Minimum 8 characters"
                    value={passNew}
                    onChange={e => setPassNew(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={passConfirm}
                    onChange={e => setPassConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setShowPassModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  Update password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE ACCOUNT MODAL ───────────────────────────── */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-danger)' }}>Delete Account</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>✕</button>
            </div>
            <form onSubmit={handleDeleteAccount}>
              <div className="modal-body">
                <p className="profile-hint" style={{ color: '#991B1B', marginBottom: '16px' }}>
                  This action is permanent and cannot be undone. All your personal profile data will be permanently removed.
                </p>

                <div className="form-group">
                  <label className="form-label">Type <strong>DELETE</strong> to confirm</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="DELETE"
                    value={deleteText}
                    onChange={e => setDeleteText(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">Enter Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={deletePass}
                    onChange={e => setDeletePass(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--danger"
                  disabled={loading || deleteText !== 'DELETE' || !deletePass}
                >
                  Permanently delete account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
