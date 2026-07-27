'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateFirmProfile,
  updateBillingDefaults,
  updatePortalSettings,
  updateSecuritySettings,
  FirmSettingsData,
} from '@/actions/firmSettings'

interface SuperAdminSettingsViewProps {
  settings: FirmSettingsData
}

export function SuperAdminSettingsView({ settings }: SuperAdminSettingsViewProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [portalMsgCount, setPortalMsgCount] = useState(settings.portal_message?.length || 0)

  // ── Firm Profile ──
  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updateFirmProfile(formData)
    setLoading(false)

    if (!res.success) setMsg({ type: 'error', text: res.error || 'Failed to update firm profile.' })
    else {
      setMsg({ type: 'success', text: 'Firm profile updated successfully!' })
      router.refresh()
    }
  }

  // ── Billing Defaults ──
  async function handleBillingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updateBillingDefaults(formData)
    setLoading(false)

    if (!res.success) setMsg({ type: 'error', text: res.error || 'Failed to update billing defaults.' })
    else {
      setMsg({ type: 'success', text: 'Billing defaults updated successfully!' })
      router.refresh()
    }
  }

  // ── Portal Settings ──
  async function handlePortalSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updatePortalSettings(formData)
    setLoading(false)

    if (!res.success) setMsg({ type: 'error', text: res.error || 'Failed to update portal settings.' })
    else {
      setMsg({ type: 'success', text: 'Client portal settings updated successfully!' })
      router.refresh()
    }
  }

  // ── Security Settings ──
  async function handleSecuritySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await updateSecuritySettings(formData)
    setLoading(false)

    if (!res.success) setMsg({ type: 'error', text: res.error || 'Failed to update security settings.' })
    else {
      setMsg({ type: 'success', text: 'Security settings updated successfully!' })
      router.refresh()
    }
  }

  return (
    <div className="profile-container">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title">Firm Settings (Super Admin)</h1>
          <p className="page-subtitle">Full law firm administrative settings, billing defaults, and security controls</p>
        </div>
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {/* ── 1. FIRM PROFILE ── */}
      <form onSubmit={handleProfileSubmit} className="profile-card" style={{ marginBottom: '24px' }}>
        <h2 className="profile-card-title">1. Firm Profile & Branding</h2>
        <div className="settings-form-layout">
          <div className="form-group">
            <label className="form-label">Firm Name</label>
            <input type="text" name="firm_name" className="form-input" defaultValue={settings.firm_name} required />
          </div>

          <div className="form-group">
            <label className="form-label">Firm Logo</label>
            <input type="file" name="logo" accept="image/*" className="form-input" />
            {settings.logo_signed_url && (
              <div style={{ marginTop: '8px' }}>
                <img src={settings.logo_signed_url} alt="Logo" style={{ height: '40px', objectFit: 'contain' }} />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Firm Office Address</label>
            <textarea name="address" className="form-input profile-textarea" defaultValue={settings.address || ''} style={{ height: '70px' }} />
          </div>

          <div className="form-group">
            <label className="form-label">Primary Contact Email</label>
            <input type="email" name="contact_email" className="form-input" defaultValue={settings.contact_email || ''} />
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input type="tel" name="phone" className="form-input" defaultValue={settings.phone || ''} />
          </div>

          <div className="form-group">
            <label className="form-label">Website URL</label>
            <input type="url" name="website" className="form-input" defaultValue={settings.website || ''} />
          </div>

          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>Save Firm Profile</button>
          </div>
        </div>
      </form>

      {/* ── 2. BILLING DEFAULTS (SUPER ADMIN ONLY) ── */}
      <form onSubmit={handleBillingSubmit} className="profile-card" style={{ marginBottom: '24px' }}>
        <h2 className="profile-card-title">2. Billing & Financial Defaults</h2>
        <div className="settings-form-layout">
          <div className="form-group">
            <label className="form-label">Invoice Currency</label>
            <select name="invoice_currency" className="form-input" defaultValue={settings.invoice_currency}>
              <option value="NGN">NGN (₦ - Nigerian Naira)</option>
              <option value="USD">USD ($ - US Dollar)</option>
              <option value="GBP">GBP (£ - British Pound)</option>
              <option value="EUR">EUR (€ - Euro)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Invoice Number Format (Prefix)</label>
            <input type="text" name="invoice_number_format" className="form-input" defaultValue={settings.invoice_number_format} required />
          </div>

          <div className="form-group">
            <label className="form-label">Tax Label</label>
            <input type="text" name="tax_label" className="form-input" defaultValue={settings.tax_label || 'VAT 7.5%'} />
          </div>

          <div className="form-group">
            <label className="form-label">Tax Rate (%)</label>
            <input type="number" step="0.01" name="tax_rate" className="form-input" defaultValue={settings.tax_rate} />
          </div>

          <div className="form-group">
            <label className="form-label">Default Payment Terms</label>
            <input type="text" name="payment_terms" className="form-input" defaultValue={settings.payment_terms || ''} />
          </div>

          <div className="form-group">
            <label className="form-label">Bank Account Details (Displayed on Invoices)</label>
            <textarea name="bank_details" className="form-input profile-textarea" defaultValue={settings.bank_details || ''} style={{ height: '70px' }} />
          </div>

          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>Save Billing Defaults</button>
          </div>
        </div>
      </form>

      {/* ── 3. CLIENT PORTAL SETTINGS ── */}
      <form onSubmit={handlePortalSubmit} className="profile-card" style={{ marginBottom: '24px' }}>
        <h2 className="profile-card-title">3. Client Portal Controls</h2>
        <div className="settings-form-layout">
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="form-label">Portal Header Message (Max 200 chars)</label>
              <span className="profile-hint">{portalMsgCount}/200</span>
            </div>
            <textarea
              name="portal_message"
              className="form-input profile-textarea"
              maxLength={200}
              defaultValue={settings.portal_message || ''}
              onChange={(e) => setPortalMsgCount(e.target.value.length)}
              style={{ height: '70px' }}
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="allow_client_download" defaultChecked={settings.allow_client_download} />
              <span>Allow clients to download visible case documents in portal</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="show_attorney_phone" defaultChecked={settings.show_attorney_phone} />
              <span>Show assigned attorney phone number by default in portal</span>
            </label>
          </div>

          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>Save Portal Controls</button>
          </div>
        </div>
      </form>

      {/* ── 4. SECURITY & SESSION TIMEOUT ── */}
      <form onSubmit={handleSecuritySubmit} className="profile-card">
        <h2 className="profile-card-title">4. Firm Security & 2FA Enforcement</h2>
        <div className="settings-form-layout">
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="enforce_2fa" defaultChecked={settings.enforce_2fa} />
              <span>Enforce Two-Factor Authentication (2FA) firm-wide for all members</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Session Timeout</label>
            <select name="session_timeout_minutes" className="form-input" defaultValue={settings.session_timeout_minutes}>
              <option value="60">1 Hour</option>
              <option value="240">4 Hours</option>
              <option value="480">8 Hours</option>
              <option value="1440">24 Hours</option>
              <option value="10080">7 Days</option>
            </select>
          </div>

          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>Save Security Settings</button>
          </div>
        </div>
      </form>
    </div>
  )
}
