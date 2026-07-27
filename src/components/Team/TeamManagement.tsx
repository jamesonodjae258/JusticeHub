'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTeamInvitation,
  resendInvitation,
  toggleUserStatus,
  promoteUserToAdmin,
} from '@/actions/userManagement'

interface TeamMember {
  id: string
  full_name: string
  role: string
  status: string
  created_at: string
  avatar_url?: string | null
  avatar_signed_url?: string | null
  email?: string
}

interface PendingInvite {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
  expires_at: string
}

interface TeamManagementProps {
  members: TeamMember[]
  pendingInvites: PendingInvite[]
  currentUserRole: string
  currentUserId: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function TeamManagement({
  members,
  pendingInvites,
  currentUserRole,
  currentUserId,
}: TeamManagementProps) {
  const router = useRouter()

  // Filter members based on role
  // super_admin sees all; firm_admin sees attorneys and staff only
  const visibleMembers = members.filter(m => {
    if (currentUserRole === 'super_admin') return true
    if (currentUserRole === 'firm_admin') return ['attorney', 'staff'].includes(m.role)
    return false
  })

  const activeMembers = visibleMembers.filter(m => m.status === 'active')
  const deactivatedMembers = visibleMembers.filter(m => m.status === 'deactivated')

  // UI state
  const [showDeactivated, setShowDeactivated] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Invite Form state
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'firm_admin' | 'attorney' | 'staff'>('attorney')

  // Promote Modal state
  const [promoteTarget, setPromoteTarget] = useState<TeamMember | null>(null)
  const [promoteRole, setPromoteRole] = useState<'firm_admin' | 'super_admin'>('firm_admin')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Toast / Error state
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Handle Invite ──
  async function handleSendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const res = await createTeamInvitation({
      email: inviteEmail,
      name:  inviteName,
      role:  inviteRole,
    })

    setLoading(false)

    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Failed to send invite.' })
    } else {
      setMsg({ type: 'success', text: `Invitation sent to ${inviteEmail}!` })
      setInviteName('')
      setInviteEmail('')
      setShowInviteModal(false)
      router.refresh()
    }
  }

  // ── Handle Resend Invite ──
  async function handleResendInvite(inviteId: string) {
    setMsg(null)
    const res = await resendInvitation(inviteId)
    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Failed to resend invite.' })
    } else {
      setMsg({ type: 'success', text: 'Invitation resent with a fresh 24-hour token.' })
      router.refresh()
    }
  }

  // ── Handle Deactivate / Reactivate ──
  async function handleToggleStatus(targetId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active'
    const verb = newStatus === 'deactivated' ? 'deactivate' : 'reactivate'

    if (!confirm(`Are you sure you want to ${verb} this team member?`)) return

    setMsg(null)
    const res = await toggleUserStatus(targetId, newStatus)

    if (!res.success) {
      setMsg({ type: 'error', text: res.error || `Failed to ${verb} member.` })
    } else {
      setMsg({ type: 'success', text: `Team member ${newStatus === 'deactivated' ? 'deactivated' : 'reactivated'} successfully.` })
      router.refresh()
    }
  }

  // ── Handle Admin Promotion ──
  async function handlePromoteSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!promoteTarget) return

    setMsg(null)
    setLoading(true)

    const res = await promoteUserToAdmin(promoteTarget.id, promoteRole, confirmPassword)
    setLoading(false)

    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Promotion failed.' })
    } else {
      setMsg({ type: 'success', text: `${promoteTarget.full_name} promoted to ${promoteRole === 'super_admin' ? 'Super Admin' : 'Firm Admin'}.` })
      setPromoteTarget(null)
      setConfirmPassword('')
      router.refresh()
    }
  }

  return (
    <div>
      {/* Header Bar */}
      <div className="team-header">
        <div>
          <h1 className="page-title">Team Management</h1>
          <p className="page-subtitle">Manage law firm attorneys, staff members, and invitations</p>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShowInviteModal(true)}
        >
          + Invite Team Member
        </button>
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* Active Team Table */}
      <div className="team-table-wrapper" style={{ marginBottom: '28px' }}>
        <h2 className="profile-card-title" style={{ padding: '16px 20px 0 20px', fontSize: '15px' }}>
          Active Team Members ({activeMembers.length})
        </h2>
        <table className="team-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="team-member-cell">
                    <div className="avatar-sm">
                      {member.avatar_signed_url ? (
                        <img src={member.avatar_signed_url} alt="" className="avatar-img" />
                      ) : (
                        <span className="avatar-fallback">{member.full_name?.charAt(0) || 'U'}</span>
                      )}
                    </div>
                    <div>
                      <span className="team-member-name">{member.full_name}</span>
                      {member.id === currentUserId && <span className="profile-hint" style={{ marginLeft: '6px' }}>(You)</span>}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${member.role === 'super_admin' ? 'badge--urgent' : (member.role === 'firm_admin' ? 'badge--admin' : 'badge--active')}`}>
                    {member.role.replace('_', ' ').toUpperCase()}
                  </span>
                </td>
                <td>
                  <span className="badge badge--active">Active</span>
                </td>
                <td className="team-date">{formatDate(member.created_at)}</td>
                <td>
                  <div className="team-actions">
                    {/* Deactivate Button */}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--danger-ghost"
                      onClick={() => handleToggleStatus(member.id, member.status)}
                    >
                      Deactivate
                    </button>

                    {/* Promote Button (Super Admin Only) */}
                    {currentUserRole === 'super_admin' && member.role !== 'super_admin' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setPromoteTarget(member)
                          setConfirmPassword('')
                        }}
                      >
                        Promote to Admin
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {activeMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="team-empty">No active team members found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Invitations Table */}
      {pendingInvites.length > 0 && (
        <div className="team-table-wrapper" style={{ marginBottom: '28px' }}>
          <h2 className="profile-card-title" style={{ padding: '16px 20px 0 20px', fontSize: '15px' }}>
            Pending Invitations ({pendingInvites.length})
          </h2>
          <table className="team-table">
            <thead>
              <tr>
                <th>Invitee Name</th>
                <th>Email</th>
                <th>Assigned Role</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((invite) => (
                <tr key={invite.id}>
                  <td style={{ fontWeight: 600 }}>{invite.full_name}</td>
                  <td>{invite.email}</td>
                  <td>
                    <span className="badge badge--pending">{invite.role.toUpperCase()}</span>
                  </td>
                  <td className="team-date">{formatDate(invite.expires_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleResendInvite(invite.id)}
                    >
                      Resend Invite
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collapsible Deactivated Section */}
      {deactivatedMembers.length > 0 && (
        <div className="profile-card">
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowDeactivated(!showDeactivated)}
          >
            <h2 className="profile-card-title" style={{ color: 'var(--color-text-muted)', margin: 0 }}>
              Deactivated Members ({deactivatedMembers.length})
            </h2>
            <button type="button" className="btn btn--ghost btn--sm">
              {showDeactivated ? 'Hide Deactivated ▲' : 'Show Deactivated ▼'}
            </button>
          </div>

          {showDeactivated && (
            <div className="team-table-wrapper" style={{ marginTop: '16px', border: 'none' }}>
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deactivatedMembers.map((member) => (
                    <tr key={member.id}>
                      <td>{member.full_name}</td>
                      <td><span className="badge badge--expired">{member.role}</span></td>
                      <td><span className="badge badge--expired">Deactivated</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => handleToggleStatus(member.id, member.status)}
                        >
                          Reactivate Login
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite Team Member</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSendInvite}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Barrister Alex Smith"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Work Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="alex@yourfirm.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Role</label>
                  <select
                    className="form-input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                  >
                    <option value="attorney">Attorney</option>
                    <option value="staff">Paralegal / Staff</option>
                    {/* firm_admin role option ONLY visible to super_admin */}
                    {currentUserRole === 'super_admin' && (
                      <option value="firm_admin">Firm Admin</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  {loading ? 'Sending Invite…' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Friction Promote Admin Modal */}
      {promoteTarget && (
        <div className="modal-backdrop" onClick={() => setPromoteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">High-Friction Action: Promote Member</h2>
              <button className="modal-close" onClick={() => setPromoteTarget(null)}>✕</button>
            </div>

            <form onSubmit={handlePromoteSubmit}>
              <div className="modal-body">
                <p className="profile-hint" style={{ marginBottom: '16px' }}>
                  You are promoting <strong>{promoteTarget.full_name}</strong>. Admin roles grant administrative management capabilities over firm settings and members.
                </p>

                <div className="form-group">
                  <label className="form-label">Target Admin Role</label>
                  <select
                    className="form-input"
                    value={promoteRole}
                    onChange={(e) => setPromoteRole(e.target.value as any)}
                  >
                    <option value="firm_admin">Firm Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Re-enter your Super Admin Password to Confirm</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Your account password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn--ghost" onClick={() => setPromoteTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={loading}>
                  {loading ? 'Confirming…' : 'Confirm & Promote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
