'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateFeatureFlag } from '@/actions/superadmin'
import type { FeatureFlagRow } from '@/types/database.types'

interface FeatureFlagsFormProps {
  flags: FeatureFlagRow[]
}

export function FeatureFlagsForm({ flags }: FeatureFlagsFormProps) {
  const router = useRouter()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleToggle(key: string, currentGlobal: boolean, firmOverrides: Record<string, boolean>) {
    setLoadingKey(key)
    setMsg(null)
    const newStatus = !currentGlobal
    const res = await updateFeatureFlag(key, newStatus, firmOverrides)
    setLoadingKey(null)

    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: `Feature flag ${key} updated!` })
      router.refresh()
    }
  }

  return (
    <div className="profile-card" style={{ maxWidth: '720px' }}>
      <h2 className="profile-card-title">Global Feature Flags & Maintenance</h2>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      <div className="sa-flags-list">
        {flags.map((flag) => (
          <div key={flag.key} className="sa-flag-item">
            <div>
              <strong className="sa-flag-title">{flag.name}</strong>
              <p className="profile-hint">Flag key: <code>{flag.key}</code></p>
            </div>
            <div className="sa-flag-toggle">
              <label className="profile-toggle-label">
                <input
                  type="checkbox"
                  checked={flag.global_enabled}
                  onChange={() => handleToggle(flag.key, flag.global_enabled, flag.firm_overrides)}
                  disabled={loadingKey === flag.key}
                />
                <span>{flag.global_enabled ? 'Enabled Globally' : 'Disabled Globally'}</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
