import { NextRequest, NextResponse } from 'next/server'
import { createClient as createBaseClient } from '@supabase/supabase-js'

/**
 * GET /api/invite/validate?token=<uuid>
 *
 * Public endpoint — validates an invitation token without authentication.
 * Returns invitation details if valid; error if expired, used, or not found.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
  }

  const adminSupabase = createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Look up the invitation by token
  const { data: invitation, error } = await adminSupabase
    .from('firm_invitations')
    .select('id, email, full_name, role, firm_id, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (error || !invitation) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  }

  // Check if already accepted
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired. Ask your admin to resend it.' }, { status: 410 })
  }

  // Get firm name for display
  const { data: firm } = await adminSupabase
    .from('firm')
    .select('name')
    .eq('id', invitation.firm_id)
    .single()

  return NextResponse.json({
    email:     invitation.email,
    full_name: invitation.full_name,
    role:      invitation.role,
    firm_name: firm?.name ?? 'Your firm',
  })
}
