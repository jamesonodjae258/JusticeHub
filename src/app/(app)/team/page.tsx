import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/AppShell/TopBar'
import { TeamManagement } from '@/components/Team/TeamManagement'
import { getSignedAvatarUrls } from '@/actions/profile'

export default async function TeamPage() {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  // 1. Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id, firm_id, role, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'deactivated') redirect('/auth/login')
  if (!['super_admin', 'firm_admin'].includes(profile.role)) redirect('/dashboard')

  const { data: firm } = await supabase
    .from('firm')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  // 2. Fetch firm members
  const { data: members } = await adminSupabase
    .from('user_profile')
    .select('id, full_name, role, status, created_at')
    .eq('firm_id', profile.firm_id)
    .order('created_at', { ascending: false })

  const memberIds = (members ?? []).map(m => m.id)

  // Fetch avatar URLs from profiles
  let avatarMap: Record<string, string | null> = {}
  let avatarSignedMap: Record<string, string> = {}

  if (memberIds.length > 0) {
    const { data: profilesData } = await adminSupabase
      .from('profiles')
      .select('user_id, avatar_url')
      .in('user_id', memberIds)

    const avatarPaths: string[] = []
    profilesData?.forEach(p => {
      avatarMap[p.user_id] = p.avatar_url
      if (p.avatar_url) avatarPaths.push(p.avatar_url)
    })

    avatarSignedMap = await getSignedAvatarUrls(avatarPaths)
  }

  const enrichedMembers = (members ?? []).map(m => ({
    ...m,
    avatar_url: avatarMap[m.id] ?? null,
    avatar_signed_url: avatarMap[m.id] ? (avatarSignedMap[avatarMap[m.id]!] ?? null) : null,
  }))

  // 3. Fetch pending firm invitations
  const { data: pendingInvites } = await adminSupabase
    .from('firm_invitations')
    .select('id, email, full_name, role, created_at, expires_at')
    .eq('firm_id', profile.firm_id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  return (
    <>
      <TopBar firmName={firm?.name ?? 'Your Firm'} title="Team Management" />
      <main className="app-content">
        <TeamManagement
          members={enrichedMembers}
          pendingInvites={pendingInvites ?? []}
          currentUserRole={profile.role}
          currentUserId={user.id}
        />
      </main>
    </>
  )
}
