'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientProfile } from '@/actions/profile'
import type { ProfileRow } from '@/types/database.types'

interface ClientProfileFormProps {
  profile: ProfileRow | null
  clientName: string
  clientPhone: string | null
  clientEmail: string
}

export function ClientProfileForm({
  profile,
  clientName,
  clientPhone,
  clientEmail,
}: ClientProfileFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [displayName, setDisplayName] = useState(profile?.display_name || clientName)
  const [phone, setPhone] = useState(profile?.phone || clientPhone || '')
  const [language, setLanguage] = useState(profile?.preferred_language || 'en')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    const formData = new FormData()
    formData.append('display_name', displayName)
    formData.append('phone', phone)
    formData.append('preferred_language', language)

    const res = await updateClientProfile(formData)

    if (!res.success) {
      setError(res.error ?? 'Failed to update profile.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    router.refresh()

    setTimeout(() => {
      setSuccess(false)
    }, 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="portal-profile-form">
      {error && <div className="team-error">{error}</div>}
      {success && <div className="profile-success-toast">Profile updated!</div>}

      <div className="form-group">
        <label htmlFor="client-display-name" className="form-label">Full Name</label>
        <input
          id="client-display-name"
          type="text"
          className="form-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="client-email" className="form-label">Email</label>
        <input
          id="client-email"
          type="email"
          className="form-input"
          value={clientEmail}
          disabled
        />
      </div>

      <div className="form-group">
        <label htmlFor="client-phone" className="form-label">Phone Number</label>
        <input
          id="client-phone"
          type="tel"
          className="form-input"
          placeholder="+234 800 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="client-language" className="form-label">Preferred Language</label>
        <select
          id="client-language"
          className="form-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="yo">Yoruba</option>
          <option value="ig">Igbo</option>
          <option value="ha">Hausa</option>
        </select>
      </div>

      <div className="portal-profile-actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={loading}
          id="save-client-profile-btn"
        >
          {loading ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
