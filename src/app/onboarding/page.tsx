import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/Onboarding/OnboardingWizard'

export default async function OnboardingPage() {
  const supabase = await createClient()

  // Check current auth user
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Check if user already has a firm & profile set up
    const { data: profile } = await supabase
      .from('user_profile')
      .select('firm_id, role, status')
      .eq('id', user.id)
      .maybeSingle()

    // If profile & firm already exist, redirect away to role dashboard
    if (profile?.firm_id && profile?.role) {
      if (profile.role === 'super_admin') redirect('/dashboard/overview')
      if (profile.role === 'firm_admin') redirect('/dashboard/admin')
      if (['attorney', 'staff'].includes(profile.role)) redirect('/dashboard/lawyer')
      if (profile.role === 'client') redirect('/portal')
    }

    return (
      <OnboardingWizard
        initialUserId={user.id}
        initialFirmId={profile?.firm_id ?? null}
        isAlreadyAuthed={true}
      />
    )
  }

  return <OnboardingWizard />
}
