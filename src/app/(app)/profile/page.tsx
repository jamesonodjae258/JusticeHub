import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/actions/profile'
import { TopBar } from '@/components/AppShell/TopBar'
import { ProfileEditor } from '@/components/Profile/ProfileEditor'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/auth/login')

  return (
    <>
      <TopBar firmName={profile.firm_name ?? 'Your Firm'} title="My Profile" />
      <main className="app-content">
        <ProfileEditor profile={profile} />
      </main>
    </>
  )
}
