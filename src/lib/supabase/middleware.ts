import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every request.
 * Must be called from src/proxy.ts.
 *
 * Route map (Phase 2 — 5 roles):
 *   /cases/*      → firm_admin + attorney + staff
 *   /dashboard/*  → firm_admin + attorney + staff
 *   /clients/*    → firm_admin + attorney + staff
 *   /documents/*  → firm_admin + attorney + staff
 *   /superadmin/* → super_admin only
 *   /portal/*     → clients only
 *   /auth/*       → public (redirect to correct home if already authed)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add any logic between createServerClient and
  // getUser(). A bug here could make it very hard to debug issues with
  // users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthRoute           = pathname.startsWith('/auth')
  const isDashboardRoute      = pathname.startsWith('/dashboard')
  const isCasesRoute          = pathname.startsWith('/cases')
  const isClientsRoute        = pathname.startsWith('/clients')
  const isDocumentsRoute      = pathname.startsWith('/documents')
  const isTeamRoute           = pathname.startsWith('/team')
  const isSettingsRoute       = pathname.startsWith('/settings')
  const isSuperAdminRoute     = pathname.startsWith('/superadmin')
  const isPortalRoute         = pathname.startsWith('/portal')
  const isPortalLoginRoute    = isPortalRoute && pathname.endsWith('/login')
  const isProtectedStaffRoute = isDashboardRoute || isCasesRoute || isClientsRoute || isDocumentsRoute || isTeamRoute || isSettingsRoute

  // ── SUPERADMIN ROUTE ISOLATION — MUST RETURN 404 TO NON-SUPERADMINS ──
  if (isSuperAdminRoute) {
    if (!user) {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }

    const { data: saProfile } = await supabase
      .from('user_profile')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle()

    if (!saProfile || saProfile.role !== 'super_admin' || saProfile.status === 'deactivated') {
      // 404 rewrite — do not reveal that /superadmin route exists
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }
  }

  // ── Unauthenticated → send to login ──────────────────────────
  if (!user && (isProtectedStaffRoute || (isPortalRoute && !isPortalLoginRoute))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = isPortalRoute ? '/auth/client-login' : '/auth/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Authenticated on an auth page → redirect to correct home ──
  // Exception: /auth/confirm must always run (it exchanges the token and
  // sets up the firm/profile). /auth/signout must also be excluded.
  const isConfirmRoute = pathname.startsWith('/auth/confirm')
  const isSignoutRoute = pathname.startsWith('/auth/signout')

  if (user && isAuthRoute && !isConfirmRoute && !isSignoutRoute) {
    // Fetch profile and client records in parallel
    const [clientRes, profileRes] = await Promise.all([
      supabase.from('client').select('id').eq('auth_user_id', user.id).maybeSingle(),
      supabase.from('user_profile').select('role, status').eq('id', user.id).maybeSingle()
    ])

    const clientRow = clientRes.data
    const profile = profileRes.data

    if (!clientRow && !profile) {
      // Stale session or failed signup confirmation: sign out to clear session and break the loop
      await supabase.auth.signOut()
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      loginUrl.searchParams.set('error', 'confirmation_failed')
      return NextResponse.redirect(loginUrl)
    }

    // Block deactivated users
    if (profile?.status === 'deactivated') {
      await supabase.auth.signOut()
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      loginUrl.searchParams.set('error', 'account_deactivated')
      return NextResponse.redirect(loginUrl)
    }

    const homeUrl = request.nextUrl.clone()
    if (profile?.role === 'super_admin') {
      homeUrl.pathname = '/superadmin'
    } else if (clientRow) {
      homeUrl.pathname = '/portal'
    } else {
      homeUrl.pathname = '/dashboard'
    }
    homeUrl.search = ''
    return NextResponse.redirect(homeUrl)
  }

  // ── Super admin trying to access firm routes → superadmin home ──
  if (user && (isProtectedStaffRoute || isPortalRoute)) {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle()

    // Block deactivated users
    if (profile?.status === 'deactivated') {
      await supabase.auth.signOut()
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      loginUrl.searchParams.set('error', 'account_deactivated')
      return NextResponse.redirect(loginUrl)
    }

    if (profile?.role === 'super_admin') {
      const superUrl = request.nextUrl.clone()
      superUrl.pathname = '/superadmin'
      superUrl.search = ''
      return NextResponse.redirect(superUrl)
    }
  }

  // ── Client user trying to access staff routes → portal ───────
  if (user && isProtectedStaffRoute) {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'client') {
      const portalUrl = request.nextUrl.clone()
      portalUrl.pathname = '/portal'
      portalUrl.search = ''
      return NextResponse.redirect(portalUrl)
    }
  }

  // ── Staff/attorney/admin user trying to access portal route → dashboard ──
  if (user && isPortalRoute) {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && ['firm_admin', 'attorney', 'staff'].includes(profile.role)) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      dashboardUrl.search = ''
      return NextResponse.redirect(dashboardUrl)
    }
  }

  // ── Non-super-admin trying to access /superadmin → their home ──
  if (user && isSuperAdminRoute) {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'super_admin') {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = profile ? '/dashboard' : '/portal'
      homeUrl.search = ''
      return NextResponse.redirect(homeUrl)
    }
  }

  return supabaseResponse
}
