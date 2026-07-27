'use client'

import { useState } from 'react'
import { updateProfile, ProfileData } from '@/actions/profile'

interface ProfileEditorProps {
  profile: ProfileData
}

const PRACTICE_AREA_OPTIONS = [
  'Civil',
  'Criminal',
  'Corporate',
  'Family',
  'Property',
  'Immigration',
  'Labour',
  'Other',
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ProfileEditor({ profile }: ProfileEditorProps) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [bioCount, setBioCount] = useState(profile.bio?.length || 0)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_signed_url || null)

  const isAttorney = profile.role === 'attorney'

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updateProfile(formData)
    setLoading(false)

    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Failed to update profile.' })
    } else {
      setMsg({ type: 'success', text: 'Profile updated successfully!' })
    }
  }

  return (
    <div className="profile-container">
      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* Header Profile Summary Card */}
      <div className="profile-card" style={{ marginBottom: '24px' }}>
        <div className="profile-header-meta">
          <div className="avatar-lg" style={{ width: '72px', height: '72px', fontSize: '28px' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="avatar-img" />
            ) : (
              <span className="avatar-fallback">{profile.display_name?.charAt(0) || 'U'}</span>
            )}
          </div>
          <div>
            <h1 className="page-title" style={{ fontSize: '20px', marginBottom: '4px' }}>{profile.display_name}</h1>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="badge badge--active">{profile.role.replace('_', ' ').toUpperCase()}</span>
              <span className="profile-hint">• {profile.firm_name}</span>
              <span className="profile-hint">• Member since {formatDate(profile.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="profile-card">
        <h2 className="profile-card-title">Personal Profile Information</h2>

        <div className="settings-form-layout">
          {/* Avatar Upload */}
          <div className="form-group">
            <label className="form-label">Profile Photo (Avatar)</label>
            <input
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="form-input"
              onChange={handleAvatarChange}
            />
            <span className="profile-hint">Stored in a private secure storage bucket. Max 5MB (JPG, PNG, WebP).</span>
          </div>

          {/* Display Name */}
          <div className="form-group">
            <label className="form-label">Full Display Name</label>
            <input
              type="text"
              name="display_name"
              className="form-input"
              defaultValue={profile.display_name}
              required
            />
          </div>

          {/* Professional Title */}
          <div className="form-group">
            <label className="form-label">Professional Title</label>
            <input
              type="text"
              name="title"
              className="form-input"
              placeholder="e.g. Senior Managing Partner / Lead Paralegal"
              defaultValue={profile.title || ''}
            />
          </div>

          {/* Phone Number */}
          <div className="form-group">
            <label className="form-label">Phone Number (Optional)</label>
            <input
              type="tel"
              name="phone"
              className="form-input"
              placeholder="+234 800 000 0000"
              defaultValue={profile.phone || ''}
            />
          </div>

          {/* Bio */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="form-label">Short Bio (Max 140 characters)</label>
              <span className="profile-hint" style={{ color: bioCount > 140 ? 'var(--color-danger)' : undefined }}>
                {bioCount}/140
              </span>
            </div>
            <textarea
              name="bio"
              className="form-input profile-textarea"
              maxLength={140}
              defaultValue={profile.bio || ''}
              onChange={(e) => setBioCount(e.target.value.length)}
              placeholder="Brief professional summary..."
            />
          </div>

          {/* Attorney-Only Fields */}
          {isAttorney && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '0.5px solid var(--color-border)' }}>
              <h3 className="profile-card-title" style={{ fontSize: '15px', color: 'var(--color-primary)' }}>
                Attorney Professional Credentials
              </h3>

              {/* Bar Number */}
              <div className="form-group">
                <label className="form-label">Bar / Roll Number</label>
                <input
                  type="text"
                  name="bar_number"
                  className="form-input"
                  placeholder="e.g. SCN123456"
                  defaultValue={profile.bar_number || ''}
                />
              </div>

              {/* Hourly Rate */}
              <div className="form-group">
                <label className="form-label">Default Hourly Rate (NGN / USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="hourly_rate"
                  className="form-input"
                  defaultValue={profile.hourly_rate}
                />
                <span className="profile-hint">Pre-fills automatically when logging billable time entries on cases.</span>
              </div>

              {/* Practice Areas Multi-Select Checkboxes */}
              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '8px' }}>Practice Areas</label>
                <div className="practice-areas-grid">
                  {PRACTICE_AREA_OPTIONS.map((area) => (
                    <label key={area} className="checkbox-label" style={{ fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        name="practice_areas"
                        value={area}
                        defaultChecked={profile.practice_areas?.includes(area)}
                      />
                      <span>{area}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Show Phone to Clients Toggle */}
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="show_phone_to_clients"
                    defaultChecked={profile.show_phone_to_clients}
                  />
                  <span>Show phone number to clients in client portal</span>
                </label>
              </div>
            </div>
          )}

          {/* Submit Action Bar */}
          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Saving Profile…' : 'Save Profile Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
