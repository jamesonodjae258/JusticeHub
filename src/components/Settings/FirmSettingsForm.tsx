'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateFirmSettings } from '@/actions/firmSettings'
import type { FirmSettingsRow } from '@/types/database.types'

interface MemberActivity {
  id: string
  full_name: string
  role: string
  status: string
  email: string
  last_sign_in_at: string | null
  created_at: string | null
}

interface FirmSettingsFormProps {
  initialFirmName: string
  settings: FirmSettingsRow | null
  loginActivity: MemberActivity[]
}

type TabType = 'profile' | 'billing' | 'portal' | 'security'

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FirmSettingsForm({
  initialFirmName,
  settings,
  loginActivity,
}: FirmSettingsFormProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form states — Firm Profile
  const [firmName, setFirmName] = useState(initialFirmName)
  const [address, setAddress] = useState(settings?.address ?? '')
  const [primaryEmail, setPrimaryEmail] = useState(settings?.primary_email ?? '')
  const [phone, setPhone] = useState(settings?.phone ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(settings?.website_url ?? '')
  const [logoPreview, setLogoPreview] = useState<string | null>(settings?.logo_signed_url ?? null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  // Form states — Billing Defaults
  const [defaultRate, setDefaultRate] = useState(settings?.default_hourly_rate?.toString() ?? '0')
  const [paymentTerms, setPaymentTerms] = useState(settings?.default_payment_terms ?? 'Payment due within 14 days')
  const [currency, setCurrency] = useState(settings?.invoice_currency ?? 'NGN')
  const [prefix, setPrefix] = useState(settings?.invoice_prefix ?? 'INV-2026-')
  const [taxLabel, setTaxLabel] = useState(settings?.tax_label ?? 'VAT 7.5%')
  const [taxRate, setTaxRate] = useState(settings?.tax_rate?.toString() ?? '7.5')
  const [bankDetails, setBankDetails] = useState(settings?.bank_details ?? '')

  // Form states — Client Portal
  const [portalMessage, setPortalMessage] = useState(settings?.portal_header_message ?? '')
  const [allowDownload, setAllowDownload] = useState(settings?.allow_client_doc_download ?? false)
  const [showPhoneDefault, setShowPhoneDefault] = useState(settings?.show_attorney_phone_by_default ?? false)

  // Form states — Security
  const [enforce2fa, setEnforce2fa] = useState(settings?.enforce_2fa ?? false)
  const [sessionTimeout, setSessionTimeout] = useState(settings?.session_timeout ?? '24h')

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Logo image file must be under 5MB.')
        return
      }
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    const formData = new FormData()
    formData.append('firm_name', firmName)
    formData.append('address', address)
    formData.append('primary_email', primaryEmail)
    formData.append('phone', phone)
    formData.append('website_url', websiteUrl)

    if (logoFile) {
      formData.append('logo_file', logoFile)
    }

    formData.append('default_hourly_rate', defaultRate)
    formData.append('default_payment_terms', paymentTerms)
    formData.append('invoice_currency', currency)
    formData.append('invoice_prefix', prefix)
    formData.append('tax_label', taxLabel)
    formData.append('tax_rate', taxRate)
    formData.append('bank_details', bankDetails)

    formData.append('portal_header_message', portalMessage)
    formData.append('allow_client_doc_download', allowDownload ? 'true' : 'false')
    formData.append('show_attorney_phone_by_default', showPhoneDefault ? 'true' : 'false')

    formData.append('enforce_2fa', enforce2fa ? 'true' : 'false')
    formData.append('session_timeout', sessionTimeout)

    const res = await updateFirmSettings(formData)

    if (!res.success) {
      setError(res.error ?? 'Failed to update firm settings.')
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
    <div className="settings-container">
      {/* Settings Tab Navigation */}
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === 'profile' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Firm profile
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'billing' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          Billing defaults
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'portal' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('portal')}
        >
          Client portal
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === 'security' ? 'settings-tab--active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security
        </button>
      </div>

      <form onSubmit={handleSubmit} className="settings-form-layout">
        {error && <div className="team-error">{error}</div>}
        {success && <div className="profile-success-toast">Firm settings saved successfully!</div>}

        {/* ── TAB 1: FIRM PROFILE ───────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="profile-card">
            <h2 className="profile-card-title">Firm Profile</h2>

            <div className="profile-avatar-wrapper" style={{ marginBottom: '24px' }}>
              <div className="profile-avatar-container" style={{ borderRadius: 'var(--radius-md)' }}>
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt={firmName} className="profile-avatar-img" />
                ) : (
                  <div className="profile-avatar-placeholder" style={{ borderRadius: 'var(--radius-md)' }}>
                    {firmName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="profile-avatar-actions">
                <label htmlFor="firm-logo-upload" className="btn btn--secondary btn--sm">
                  Upload firm logo
                </label>
                <input
                  id="firm-logo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/svg+xml,image/webp"
                  onChange={handleLogoChange}
                  style={{ display: 'none' }}
                />
                <span className="profile-hint">Displayed on invoices and client portal header</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="firm_name" className="form-label">Firm Name *</label>
              <input
                id="firm_name"
                type="text"
                className="form-input"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="primary_email" className="form-label">Primary Contact Email</label>
                <input
                  id="primary_email"
                  type="email"
                  className="form-input"
                  placeholder="contact@firm.com"
                  value={primaryEmail}
                  onChange={(e) => setPrimaryEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="firm_phone" className="form-label">Phone Number</label>
                <input
                  id="firm_phone"
                  type="tel"
                  className="form-input"
                  placeholder="+234 800 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="website_url" className="form-label">Website URL</label>
              <input
                id="website_url"
                type="url"
                className="form-input"
                placeholder="https://firm.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="address" className="form-label">Firm Address</label>
              <textarea
                id="address"
                className="form-input profile-textarea"
                placeholder="Full address (appears on invoices)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── TAB 2: BILLING DEFAULTS ───────────────────────── */}
        {activeTab === 'billing' && (
          <div className="profile-card">
            <h2 className="profile-card-title">Billing Defaults</h2>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="default_hourly_rate" className="form-label">Default Hourly Rate</label>
                <input
                  id="default_hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                />
                <span className="form-hint">Pre-fills for new attorneys (overridable in attorney profile).</span>
              </div>

              <div className="form-group">
                <label htmlFor="invoice_currency" className="form-label">Invoice Currency</label>
                <select
                  id="invoice_currency"
                  className="form-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="NGN">NGN (₦)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="invoice_prefix" className="form-label">Invoice Number Format (Prefix)</label>
                <input
                  id="invoice_prefix"
                  type="text"
                  className="form-input"
                  placeholder="e.g. INV-2026-"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="default_payment_terms" className="form-label">Default Payment Terms</label>
                <input
                  id="default_payment_terms"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Payment due within 14 days"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="tax_label" className="form-label">Tax Label</label>
                <input
                  id="tax_label"
                  type="text"
                  className="form-input"
                  placeholder="e.g. VAT 7.5%"
                  value={taxLabel}
                  onChange={(e) => setTaxLabel(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="tax_rate" className="form-label">Tax Rate (%)</label>
                <input
                  id="tax_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="bank_details" className="form-label">Bank Account Details</label>
              <textarea
                id="bank_details"
                className="form-input profile-textarea"
                placeholder="Bank Name, Account Number, Account Name (shown on invoices for payment)"
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── TAB 3: CLIENT PORTAL SETTINGS ─────────────────── */}
        {activeTab === 'portal' && (
          <div className="profile-card">
            <h2 className="profile-card-title">Client Portal Settings</h2>

            <div className="form-group">
              <div className="profile-label-row">
                <label htmlFor="portal_header_message" className="form-label">Portal Header Message</label>
                <span className={`profile-char-count ${portalMessage.length > 200 ? 'over' : ''}`}>
                  {portalMessage.length} / 200
                </span>
              </div>
              <textarea
                id="portal_header_message"
                className="form-input profile-textarea"
                placeholder="Welcome message displayed to clients upon logging into the portal (max 200 characters)"
                maxLength={200}
                value={portalMessage}
                onChange={(e) => setPortalMessage(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="profile-toggle-label">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                />
                <span>Allow clients to download shared case documents (default off)</span>
              </label>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="profile-toggle-label">
                <input
                  type="checkbox"
                  checked={showPhoneDefault}
                  onChange={(e) => setShowPhoneDefault(e.target.checked)}
                />
                <span>Show attorney phone numbers to clients by default</span>
              </label>
            </div>
          </div>
        )}

        {/* ── TAB 4: SECURITY ───────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="profile-card">
            <h2 className="profile-card-title">Security & Session Management</h2>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="profile-toggle-label">
                <input
                  type="checkbox"
                  checked={enforce2fa}
                  onChange={(e) => setEnforce2fa(e.target.checked)}
                />
                <span>Enforce 2-Factor Authentication (2FA) for all firm members</span>
              </label>
              <span className="form-hint" style={{ marginLeft: '26px' }}>
                When enabled, members must set up 2FA within 7 days to retain access.
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: '28px' }}>
              <label htmlFor="session_timeout" className="form-label">Session Timeout</label>
              <select
                id="session_timeout"
                className="form-select"
                style={{ maxWidth: '240px' }}
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
              >
                <option value="1h">1 hour</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
              </select>
            </div>

            {/* Read-only Member Login Activity Table */}
            <h3 className="team-section-title" style={{ marginTop: '24px' }}>Member Login Activity</h3>
            <div className="team-table-wrapper">
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {loginActivity.map(member => (
                    <tr key={member.id}>
                      <td style={{ fontWeight: 500 }}>{member.full_name}</td>
                      <td>
                        <span className="badge badge--staff">{member.role.replace('_', ' ')}</span>
                      </td>
                      <td className="team-email">{member.email}</td>
                      <td>
                        <span className={`badge ${member.status === 'active' ? 'badge--active' : 'badge--muted'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="team-date">{formatDate(member.last_sign_in_at)}</td>
                    </tr>
                  ))}
                  {loginActivity.length === 0 && (
                    <tr>
                      <td colSpan={5} className="team-empty">No activity records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Save button bar */}
        <div className="profile-actions-bar">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || portalMessage.length > 200}
            id="save-firm-settings-btn"
          >
            {loading ? 'Saving changes…' : 'Save firm settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
