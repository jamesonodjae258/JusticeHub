'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InviteModal } from './InviteModal'
import { PromoteDialog } from './PromoteDialog'
import {
  changeRole,
  deactivateUser,
  reactivateUser,
  resendInvitation,
} from '@/actions/team'

interface TeamMember {
  id: string
  full_name: string
  role: string
  status: string
  created_at: string
  deactivated_at: string | null
  deactivated_by: string | null
  email: string
  last_sign_in_at: string | null
}

interface Invitation {
  id: string
  email: string
  full_name: string
  role: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
  invited_by: string
}

interface TeamViewProps {
  members: TeamMember[]
  invitations: Invitation[]
  currentUserId: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(dateStr)
}

function roleBadgeClass(role: string) {
  switch (role) {
    case 'firm_admin': return 'badge badge--admin'
    case 'attorney':   return 'badge badge--attorney'
    case 'staff':      return 'badge badge--staff'
    default:           return 'badge'
  }
}

function roleLabel(role: string) {
  switch (role) {
    case 'firm_admin': return 'Firm Admin'
    case 'attorney':   return 'Attorney'
    case 'staff':      return 'Staff'
    default:           return role
  }
}

export function TeamView({ members, invitations, currentUserId }: TeamViewProps) {
  const router = useRouter()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [promoteTarget, setPromoteTarget] = useState<TeamMember | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeactivated, setShowDeactivated] = useState(false)

  const activeMembers = members.filter(m => m.status === 'active')
  const deactivatedMembers = members.filter(m => m.status === 'deactivated')

  // Check which invitations are expired
  const enrichedInvitations = invitations.map(inv => ({
    ...inv,
    isExpired: new Date(inv.expires_at) < new Date(),
  }))

  async function handleChangeRole(userId: string, newRole: string) {
    setActionLoading(userId)
    setError(null)
    const result = await changeRole(userId, newRole)
    if ('error' in result) {
      setError(result.error ?? 'Failed to change role')
    }
    setActionLoading(null)
    router.refresh()
  }

  async function handleDeactivate(userId: string, userName: string) {
    if (!confirm(`Deactivate ${userName}? They will lose access immediately but all their work is preserved.`)) return
    setActionLoading(userId)
    setError(null)
    const result = await deactivateUser(userId)
    if ('error' in result) {
      setError(result.error ?? 'Failed to deactivate user')
    }
    setActionLoading(null)
    router.refresh()
  }

  async function handleReactivate(userId: string) {
    setActionLoading(userId)
    setError(null)
    const result = await reactivateUser(userId)
    if ('error' in result) {
      setError(result.error ?? 'Failed to reactivate user')
    }
    setActionLoading(null)
    router.refresh()
  }

  async function handleResend(invitationId: string) {
    setActionLoading(invitationId)
    setError(null)
    const result = await resendInvitation(invitationId)
    if ('error' in result) {
      setError(result.error ?? 'Failed to resend invitation')
    }
    setActionLoading(null)
    router.refresh()
  }

  return (
    <>
      {/* Page header */}
      <div className="team-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">
            {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
            {enrichedInvitations.length > 0 && ` · ${enrichedInvitations.length} pending invite${enrichedInvitations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="btn btn--primary"
          onClick={() => setShowInviteModal(true)}
          id="invite-member-btn"
        >
          {/* Plus icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Invite member
        </button>
      </div>

      {error && (
        <div className="team-error">{error}</div>
      )}

      {/* Active members table */}
      <div className="team-section">
        <h2 className="team-section-title">Active members</h2>
        <div className="team-table-wrapper">
          <table className="team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map(member => (
                <tr key={member.id}>
                  <td>
                    <div className="team-member-name">
                      <div className="team-avatar" aria-hidden="true">
                        {member.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span>{member.full_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={roleBadgeClass(member.role)}>
                      {roleLabel(member.role)}
                    </span>
                  </td>
                  <td className="team-email">{member.email}</td>
                  <td className="team-date">{formatDate(member.created_at)}</td>
                  <td className="team-date">{timeAgo(member.last_sign_in_at)}</td>
                  <td>
                    {member.id !== currentUserId && (
                      <div className="team-actions">
                        {/* Role change — only for attorney/staff */}
                        {['attorney', 'staff'].includes(member.role) && (
                          <select
                            className="team-role-select"
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.id, e.target.value)}
                            disabled={actionLoading === member.id}
                            aria-label={`Change role for ${member.full_name}`}
                          >
                            <option value="attorney">Attorney</option>
                            <option value="staff">Staff</option>
                          </select>
                        )}

                        {/* Promote to admin — only for non-admins */}
                        {member.role !== 'firm_admin' && (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => setPromoteTarget(member)}
                            disabled={actionLoading === member.id}
                            title="Promote to Firm Admin"
                          >
                            {/* Shield icon */}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
                              <path d="M12 11l0 4" />
                              <path d="M12 8l0 .01" />
                            </svg>
                          </button>
                        )}

                        {/* Deactivate */}
                        <button
                          className="btn btn--ghost btn--sm btn--danger-ghost"
                          onClick={() => handleDeactivate(member.id, member.full_name)}
                          disabled={actionLoading === member.id}
                          title="Deactivate member"
                        >
                          {/* User minus icon */}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
                            <path d="M6 21v-2a4 4 0 0 1 4 -4h3.5" />
                            <path d="M16 19h6" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {member.id === currentUserId && (
                      <span className="team-you-badge">You</span>
                    )}
                  </td>
                </tr>
              ))}
              {activeMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="team-empty">No active members</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending invitations */}
      {enrichedInvitations.length > 0 && (
        <div className="team-section">
          <h2 className="team-section-title">Pending invitations</h2>
          <div className="team-table-wrapper">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Invited</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrichedInvitations.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.full_name}</td>
                    <td className="team-email">{inv.email}</td>
                    <td>
                      <span className={roleBadgeClass(inv.role)}>
                        {roleLabel(inv.role)}
                      </span>
                    </td>
                    <td className="team-date">{formatDate(inv.created_at)}</td>
                    <td>
                      {inv.isExpired ? (
                        <span className="badge badge--expired">Expired</span>
                      ) : (
                        <span className="badge badge--pending">Pending</span>
                      )}
                    </td>
                    <td>
                      {inv.isExpired && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleResend(inv.id)}
                          disabled={actionLoading === inv.id}
                        >
                          {actionLoading === inv.id ? 'Sending…' : 'Resend'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deactivated members — collapsible */}
      {deactivatedMembers.length > 0 && (
        <div className="team-section">
          <button
            className="team-collapsible-trigger"
            onClick={() => setShowDeactivated(!showDeactivated)}
            aria-expanded={showDeactivated}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className={`team-chevron ${showDeactivated ? 'team-chevron--open' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Deactivated members</span>
            <span className="badge badge--muted">{deactivatedMembers.length}</span>
          </button>

          {showDeactivated && (
            <div className="team-table-wrapper" style={{ marginTop: '12px' }}>
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Deactivated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deactivatedMembers.map(member => (
                    <tr key={member.id} className="team-row--deactivated">
                      <td>
                        <div className="team-member-name">
                          <div className="team-avatar team-avatar--deactivated" aria-hidden="true">
                            {member.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span>{member.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge--muted">
                          {roleLabel(member.role)}
                        </span>
                      </td>
                      <td className="team-email">{member.email}</td>
                      <td className="team-date">
                        {member.deactivated_at ? formatDate(member.deactivated_at) : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleReactivate(member.id)}
                          disabled={actionLoading === member.id}
                        >
                          {actionLoading === member.id ? 'Restoring…' : 'Reactivate'}
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

      {/* Modals */}
      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {promoteTarget && (
        <PromoteDialog
          member={promoteTarget}
          onClose={() => setPromoteTarget(null)}
        />
      )}
    </>
  )
}
