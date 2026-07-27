'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/actions/profile'
import type { ProfileRow, PracticeArea } from '@/types/database.types'

interface ProfileFormProps {
  profile: ProfileRow | null
  role: string
  firmName: string
  email: string
}

const ALL_PRACTICE_AREAS: PracticeArea[] = [
  'Civil',
  'Criminal',
  'Corporate',
  'Family',
  'Property',
  'Immigration',
  'Labour',
  'Other',
]

export function ProfileForm({ profile, role, firmName, email }: ProfileFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Local state
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [title, setTitle] = useState(profile?.title ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [barNumber, setBarNumber] = useState(profile?.bar_number ?? '')
  const [hourlyRate, setHourlyRate] = useState(profile?.hourly_rate?.toString() ?? '0')
  const [showPhone, setShowPhone] = useState(profile?.show_phone_to_clients ?? false)
  const [selectedAreas, setSelectedAreas] = useState<PracticeArea[]>(profile?.practice_areas ?? [])
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_signed_url ?? null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const isAttorneyOrAdmin = ['attorney', 'firm_admin'].includes(role)
  const initialLetter = (displayName || email).charAt(0).toUpperCase()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image file must be under 5MB.')
        return
      }
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  function handlePracticeAreaToggle(area: PracticeArea) {
    if (selectedAreas.includes(area)) {
      setSelectedAreas(selectedAreas.filter(a => a !== area))
    } else {
      setSelectedAreas([...selectedAreas, area])
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    const formData = new FormData()
    formData.append('display_name', displayName)
    formData.append('title', title)
    formData.append('phone', phone)
    formData.append('bio', bio)
    formData.append('bar_number', barNumber)
    formData.append('hourly_rate', hourlyRate)
    formData.append('show_phone_to_clients', showPhone ? 'true' : 'false')

    if (avatarFile) {
      formData.append('avatar_file', avatarFile)
    }

    selectedAreas.forEach(area => {
      formData.append('practice_areas', area)
    })

    const res = await updateProfile(formData)

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
    <form onSubmit={handleSubmit} className="profile-form-layout">
      {/* Header section: Avatar & Quick Info */}
      <div className="profile-card profile-header-card">
        <div className="profile-avatar-wrapper">
          <div className="profile-avatar-container">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt={displayName} className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-placeholder">{initialLetter}</div>
            )}
          </div>
          <div className="profile-avatar-actions">
            <label htmlFor="avatar-upload-input" className="btn btn--secondary btn--sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 8h.01" />
                <path d="M12 20h-7a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v7" />
                <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l2.5 2.5" />
                <path d="M14 14l1 -1c.67 -.644 1.45 -.863 2.221 -.653" />
                <path d="M19 22v-6" />
                <path d="M16 19l3 -3l3 3" />
              </svg>
              Upload photo
            </label>
            <input
              id="avatar-upload-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <span className="profile-hint">JPG, PNG or WEBP under 5MB</span>
          </div>
        </div>

        <div className="profile-role-meta">
          <span className="badge badge--admin">{role.replace('_', ' ')}</span>
          <span className="badge badge--muted">{firmName}</span>
        </div>
      </div>

      {error && <div className="team-error">{error}</div>}
      {success && <div className="profile-success-toast">Profile updated successfully!</div>}

      {/* Personal Info Section */}
      <div className="profile-card">
        <h2 className="profile-card-title">Personal Information</h2>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="display_name" className="form-label">Full Name *</label>
            <input
              id="display_name"
              type="text"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="title" className="form-label">Professional Title</label>
            <input
              id="title"
              type="text"
              className="form-input"
              placeholder="e.g. Senior Associate, Legal Practitioner"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email Address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              disabled
            />
            <span className="form-hint">Email changes require verification from settings.</span>
          </div>

          <div className="form-group">
            <label htmlFor="phone" className="form-label">Phone Number</label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              placeholder="+234 800 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <div className="profile-label-row">
            <label htmlFor="bio" className="form-label">Short Bio</label>
            <span className={`profile-char-count ${bio.length > 140 ? 'over' : ''}`}>
              {bio.length} / 140
            </span>
          </div>
          <textarea
            id="bio"
            className="form-input profile-textarea"
            placeholder="Brief bio (max 140 characters)"
            maxLength={140}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
      </div>

      {/* Attorney-only Section */}
      {isAttorneyOrAdmin && (
        <div className="profile-card">
          <h2 className="profile-card-title">Attorney & Billing Details</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="bar_number" className="form-label">Bar / Roll Number</label>
              <input
                id="bar_number"
                type="text"
                className="form-input"
                placeholder="e.g. SCN12345"
                value={barNumber}
                onChange={(e) => setBarNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="hourly_rate" className="form-label">Hourly Rate (₦ / hr)</label>
              <input
                id="hourly_rate"
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="0.00"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
              <span className="form-hint">Pre-fills automatically on time entries.</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Practice Areas</label>
            <div className="profile-practice-chips">
              {ALL_PRACTICE_AREAS.map(area => (
                <button
                  type="button"
                  key={area}
                  className={`chip ${selectedAreas.includes(area) ? 'chip--selected' : ''}`}
                  onClick={() => handlePracticeAreaToggle(area)}
                >
                  {selectedAreas.includes(area) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {area}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label className="profile-toggle-label">
              <input
                type="checkbox"
                checked={showPhone}
                onChange={(e) => setShowPhone(e.target.checked)}
              />
              <span>Show phone number to clients in portal</span>
            </label>
          </div>
        </div>
      )}

      {/* Save Button Bar */}
      <div className="profile-actions-bar">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={loading || bio.length > 140}
          id="save-profile-btn"
        >
          {loading ? 'Saving changes…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
