import { UserProfileRow, UserRole } from '@/types/database.types'

/**
 * Checks if a user profile has the 'super_admin' role.
 * Super Admin is platform-level — never belongs to a firm.
 */
export function isSuperAdmin(profile: UserProfileRow | null): boolean {
  return profile?.role === 'super_admin'
}

/**
 * Checks if a user profile has the 'firm_admin' role.
 */
export function isAdmin(profile: UserProfileRow | null): boolean {
  return profile?.role === 'firm_admin'
}

/**
 * Checks if a user profile has the 'attorney' role.
 * Attorneys are the primary working users — full case and document access.
 */
export function isAttorney(profile: UserProfileRow | null): boolean {
  return profile?.role === 'attorney'
}

/**
 * Checks if a user is a firm-level member (admin, attorney, or staff).
 * Use this for route guards that should allow any firm team member.
 */
export function isFirmMember(profile: UserProfileRow | null): boolean {
  return profile?.role === 'firm_admin'
    || profile?.role === 'attorney'
    || profile?.role === 'staff'
}

/**
 * Checks if a user profile has the 'staff' role (paralegal / support).
 * Staff have limited access — no billing, restricted document content access.
 */
export function isStaffParalegal(profile: UserProfileRow | null): boolean {
  return profile?.role === 'staff'
}

/**
 * Checks if a user profile has the 'client' role.
 * Note: clients authenticate via auth.users but their role is tracked
 * via user_profile (role = 'client') created on invite acceptance.
 */
export function isClient(profile: UserProfileRow | null): boolean {
  return profile?.role === 'client'
}

/**
 * Returns a human-readable label for a role.
 */
export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    firm_admin: 'Firm Admin',
    attorney: 'Attorney',
    staff: 'Staff',
    client: 'Client',
  }
  return labels[role] ?? role
}

/**
 * Returns the home route for a given role.
 * Used in middleware and post-login redirects.
 */
export function homeRouteForRole(role: UserRole): string {
  if (role === 'super_admin') return '/superadmin'
  if (role === 'client') return '/portal'
  return '/dashboard'
}
