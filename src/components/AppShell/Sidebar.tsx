'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/auth/actions'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

interface SidebarProps {
  userName: string
  userRole: string
  firmName: string
  avatarUrl?: string | null
}

export function Sidebar({ userName, userRole, firmName, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const initial = userName.charAt(0).toUpperCase()

  const isActive = (prefix: string) => pathname.startsWith(prefix)

  // Automatically close mobile sidebar drawer when pathname changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile Burger / Close Toggle Button */}
      <button
        className="sidebar-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? (
          /* Tabler Close icon */
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          /* Tabler Menu (burger) icon */
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Backdrop overlay for mobile */}
      <div
        className={`sidebar-backdrop${isOpen ? ' open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      <aside className={`app-sidebar${isOpen ? ' open' : ''}${isCollapsed ? ' collapsed' : ''}`}>
        {/* Logo — light variant: dark wordmark on white sidebar */}
        <div className="sidebar-logo">
          <JusticeHubLogo variant="light" />
          <div className="sidebar-logo-sub">{firmName}</div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-section-label">Case management</div>

          <Link
            href="/cases"
            className={`nav-item${isActive('/cases') ? ' nav-item--active' : ''}`}
            id="nav-cases"
            onClick={() => setIsOpen(false)}
          >
            {/* Briefcase — Tabler outline, 18px */}
            <svg
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12" y2="16" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
            <span className="nav-text">Cases</span>
          </Link>

          <div className="nav-section-label">Firm</div>

          <Link
            href="/clients"
            className={`nav-item${isActive('/clients') ? ' nav-item--active' : ''}`}
            id="nav-clients"
            onClick={() => setIsOpen(false)}
          >
            {/* Users — Tabler outline, 18px */}
            <svg
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="nav-text">Clients</span>
          </Link>

          {userRole === 'firm_admin' && (
            <>
              <Link
                href="/team"
                className={`nav-item${isActive('/team') ? ' nav-item--active' : ''}`}
                id="nav-team"
                onClick={() => setIsOpen(false)}
              >
                {/* Users Group — Tabler outline, 18px */}
                <svg
                  width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1" />
                  <path d="M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M17 10h2a2 2 0 0 1 2 2v1" />
                  <path d="M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                  <path d="M3 13v-1a2 2 0 0 1 2 -2h2" />
                </svg>
                <span className="nav-text">Team</span>
              </Link>

              <Link
                href="/settings/firm"
                className={`nav-item${isActive('/settings/firm') ? ' nav-item--active' : ''}`}
                id="nav-firm-settings"
                onClick={() => setIsOpen(false)}
              >
                {/* Settings / Building — Tabler outline, 18px */}
                <svg
                  width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 21l18 0" />
                  <path d="M5 21v-14l8 -4v18" />
                  <path d="M19 21v-10l-6 -4" />
                  <path d="M9 9l0 .01" />
                  <path d="M9 12l0 .01" />
                  <path d="M9 15l0 .01" />
                  <path d="M9 18l0 .01" />
                </svg>
                <span className="nav-text">Firm settings</span>
              </Link>
            </>
          )}

          <Link
            href="/documents"
            className={`nav-item${isActive('/documents') ? ' nav-item--active' : ''}`}
            id="nav-documents"
            onClick={() => setIsOpen(false)}
          >
            {/* File-text — Tabler outline, 18px */}
            <svg
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="nav-text">Documents</span>
          </Link>
        </nav>

        {/* User / sign-out */}
        <div className="sidebar-footer">
          <Link
            href="/profile"
            className="sidebar-user"
            onClick={() => setIsOpen(false)}
            title="View profile settings"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={userName} className="sidebar-avatar-img" />
            ) : (
              <div className="sidebar-avatar" aria-hidden="true">{initial}</div>
            )}
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">{userRole.replace('_', ' ')}</div>
            </div>
          </Link>

          {/* Desktop Manual Collapse Toggle Button */}
          <button
            type="button"
            className="nav-item sidebar-manual-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              /* Tabler Chevron Right icon */
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              /* Tabler Chevron Left icon */
              <>
                <svg
                  width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="nav-text">Collapse sidebar</span>
              </>
            )}
          </button>

          <form action={signOut}>
            <button
              type="submit"
              id="sidebar-signout-btn"
              className="nav-item nav-item--danger"
              style={{ marginTop: '4px' }}
            >
              {/* Log-out — Tabler outline, 18px */}
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="nav-text">Sign out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
