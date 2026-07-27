import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware — Phase 2 PRD v3.0
 * Enforces strict 404 route group isolation for non-owner roles:
 *   /dashboard/overview/** → super_admin only
 *   /dashboard/admin/**    → firm_admin only
 *   /dashboard/lawyer/**   → attorney + staff only
 *   /portal/**             → client only
 *   /onboarding            → firm signup (super_admin creation)
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthRoute           = pathname.startsWith('/auth')
  const isOnboardingRoute     = pathname.startsWith('/onboarding')
  const isSuperOverviewRoute  = pathname.startsWith('/dashboard/overview') || pathname.startsWith('/superadmin')
  const isAdminDashboardRoute = pathname.startsWith('/dashboard/admin')
  const isLawyerDashboardRoute= pathname.startsWith('/dashboard/lawyer')
  const isGenericDashboard    = pathname === '/dashboard' || pathname === '/dashboard/'
  const isPortalRoute         = pathname.startsWith('/portal')
  const isPortalLoginRoute    = isPortalRoute && (pathname.endsWith('/login') || pathname.includes('/login'))

  const isProtectedDashboard  = isSuperOverviewRoute || isAdminDashboardRoute || isLawyerDashboardRoute || isGenericDashboard || pathname.startsWith('/cases') || pathname.startsWith('/clients') || pathname.startsWith('/documents') || pathname.startsWith('/team') || pathname.startsWith('/settings')

  // 1. Unauthenticated users trying to access protected routes -> redirect to login
  if (!user && (isProtectedDashboard || (isPortalRoute && !isPortalLoginRoute))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = isPortalRoute ? '/auth/client-login' : '/auth/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 2. Fetch role and status from user_profile or JWT
  let userRole: string | null = null
  let isDeactivated = false

  if (user) {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle()

    userRole = profile?.role ?? null
    isDeactivated = profile?.status === 'deactivated'
  }

  // 3. Block deactivated users immediately
  if (user && isDeactivated) {
    await supabase.auth.signOut()
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('error', 'account_deactivated')
    return NextResponse.redirect(loginUrl)
  }

  // 4. Authenticated user on auth/login or onboarding pages -> redirect to correct dashboard
  const isConfirmRoute = pathname.startsWith('/auth/confirm')
  const isSignoutRoute = pathname.startsWith('/auth/signout')

  if (user && (isAuthRoute || isOnboardingRoute) && !isConfirmRoute && !isSignoutRoute) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.search = ''

    if (userRole === 'super_admin') {
      homeUrl.pathname = '/dashboard/overview'
    } else if (userRole === 'firm_admin') {
      homeUrl.pathname = '/dashboard/admin'
    } else if (userRole === 'attorney' || userRole === 'staff') {
      homeUrl.pathname = '/dashboard/lawyer'
    } else if (userRole === 'client') {
      homeUrl.pathname = '/portal'
    } else {
      homeUrl.pathname = '/dashboard'
    }

    return NextResponse.redirect(homeUrl)
  }

  // 5. Generic `/dashboard` redirect to role-specific dashboard
  if (user && isGenericDashboard && userRole) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.search = ''

    if (userRole === 'super_admin') {
      homeUrl.pathname = '/dashboard/overview'
    } else if (userRole === 'firm_admin') {
      homeUrl.pathname = '/dashboard/admin'
    } else if (userRole === 'attorney' || userRole === 'staff') {
      homeUrl.pathname = '/dashboard/lawyer'
    } else if (userRole === 'client') {
      homeUrl.pathname = '/portal'
    }

    return NextResponse.redirect(homeUrl)
  }

  // 6. STRICT 404 ROUTE GROUP ISOLATION RULES (PRD v3.0)
  // A user hitting a route group they do not own MUST receive a 404 rewrite
  if (user && userRole) {
    // Rule A: /dashboard/overview/** is for super_admin ONLY
    if (isSuperOverviewRoute && userRole !== 'super_admin') {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }

    // Rule B: /dashboard/admin/** is for firm_admin ONLY
    if (isAdminDashboardRoute && userRole !== 'firm_admin') {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }

    // Rule C: /dashboard/lawyer/** is for attorney + staff ONLY
    if (isLawyerDashboardRoute && !['attorney', 'staff'].includes(userRole)) {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }

    // Rule D: /portal/** is for client ONLY
    if (isPortalRoute && !isPortalLoginRoute && userRole !== 'client') {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }

    // Rule E: client role cannot reach ANY /dashboard route
    if (userRole === 'client' && isProtectedDashboard) {
      return NextResponse.rewrite(new URL('/_not-found', request.url))
    }
  }

  return supabaseResponse
}
