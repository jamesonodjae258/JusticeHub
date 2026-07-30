'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createOnboardingAccount,
  saveOnboardingFirmInfo,
  saveOnboardingFirmContact,
  saveOnboardingBillingDefaults,
  inviteOnboardingMember,
} from '@/actions/onboarding'
import { JusticeHubLogo } from '@/components/ui/JusticeHubLogo'

interface OnboardingWizardProps {
  initialFirmId?: string | null
  initialUserId?: string | null
  isAlreadyAuthed?: boolean
}

export function OnboardingWizard({ initialFirmId }: OnboardingWizardProps) {
  const router = useRouter()

  // Wizard state: 1 (Account), 2A (Firm Info), 2B (Contact), 2C (Billing), 3 (Invite Prompt)
  const [currentStep, setCurrentStep] = useState<'1' | '2A' | '2B' | '2C' | '3'>(
    initialFirmId ? '2A' : '1'
  )
  const [firmId, setFirmId] = useState<string | null>(initialFirmId || null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Invite modal state inside Step 3
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'attorney' | 'staff'>('attorney')

  // ── STEP 1: Account Creation ─────────────────────────────────
  async function handleStep1Submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await createOnboardingAccount(formData)
    setLoading(false)

    if (!res.success || !res.firmId) {
      setErrorMsg(res.error || 'Account creation failed.')
    } else {
      setFirmId(res.firmId)
      setCurrentStep('2A')
    }
  }

  // ── STEP 2A: Firm Info ───────────────────────────────────────
  async function handleStep2ASubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!firmId) return setCurrentStep('3')
    setErrorMsg('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await saveOnboardingFirmInfo(firmId, formData)
    setLoading(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save firm info.')
    } else {
      setCurrentStep('2B')
    }
  }

  // ── STEP 2B: Firm Contact ────────────────────────────────────
  async function handleStep2BSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!firmId) return setCurrentStep('3')
    setErrorMsg('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await saveOnboardingFirmContact(firmId, formData)
    setLoading(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save contact info.')
    } else {
      setCurrentStep('2C')
    }
  }

  // ── STEP 2C: Billing Defaults ────────────────────────────────
  async function handleStep2CSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!firmId) return setCurrentStep('3')
    setErrorMsg('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await saveOnboardingBillingDefaults(firmId, formData)
    setLoading(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save billing settings.')
    } else {
      setCurrentStep('3')
    }
  }

  // ── STEP 3: Team Invitation ──────────────────────────────────
  async function handleInviteSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!firmId) return
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)

    const formData = new FormData()
    formData.append('name', inviteName)
    formData.append('email', inviteEmail)
    formData.append('role', inviteRole)

    const res = await inviteOnboardingMember(firmId, formData)
    setLoading(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to send invitation.')
    } else {
      setSuccessMsg(`Invitation sent to ${inviteEmail}!`)
      setInviteName('')
      setInviteEmail('')
      setShowInviteModal(false)
    }
  }

  function handleFinish() {
    router.push('/dashboard/overview')
    router.refresh()
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: currentStep === '1' ? '460px' : '620px' }}>
        <div className="auth-header">
          <div style={{ marginBottom: '0.5rem' }}>
            <JusticeHubLogo showSymbolOnly />
          </div>
          <h1 className="auth-logo" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            JusticeHub Onboarding
          </h1>
          <p className="auth-subtitle">
            {currentStep === '1' && 'Create your firm account (Super Admin)'}
            {currentStep.startsWith('2') && 'Firm Setup Wizard'}
            {currentStep === '3' && 'Your firm is ready!'}
          </p>
        </div>

        {/* Wizard Progress Bar for Step 2 */}
        {currentStep.startsWith('2') && (
          <div className="onboarding-progress">
            <div className={`onboarding-step-dot ${currentStep === '2A' ? 'onboarding-step-dot--active' : 'onboarding-step-dot--complete'}`}>
              1. Firm Info
            </div>
            <div className={`onboarding-step-dot ${currentStep === '2B' ? 'onboarding-step-dot--active' : (currentStep === '2C' ? 'onboarding-step-dot--complete' : '')}`}>
              2. Contact
            </div>
            <div className={`onboarding-step-dot ${currentStep === '2C' ? 'onboarding-step-dot--active' : ''}`}>
              3. Billing
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="auth-alert auth-alert--error">{errorMsg}</div>
        )}
        {successMsg && (
          <div className="profile-success-toast" style={{ marginBottom: '16px' }}>{successMsg}</div>
        )}

        {/* ── STEP 1: Account Creation Form ── */}
        {currentStep === '1' && (
          <form onSubmit={handleStep1Submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="onboarding-email" className="form-label">Work Email</label>
              <input
                id="onboarding-email"
                name="email"
                type="email"
                placeholder="you@yourfirm.com"
                required
                className="form-input"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="onboarding-password" className="form-label">Password</label>
              <input
                id="onboarding-password"
                name="password"
                type="password"
                placeholder="Set strong password"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="onboarding-fullname" className="form-label">Your Full Name</label>
              <input
                id="onboarding-fullname"
                name="full_name"
                type="text"
                placeholder="e.g. Barrister Jane Doe"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="onboarding-firmname" className="form-label">Initial Firm Name</label>
              <input
                id="onboarding-firmname"
                name="firm_name"
                type="text"
                placeholder="e.g. Lexis & Co. Law Practice"
                required
                className="form-input"
              />
            </div>

            <button type="submit" className="btn btn--primary btn--md" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating Firm Account…' : 'Create Firm & Super Admin Account'}
            </button>
          </form>
        )}

        {/* ── STEP 2A: Firm Profile & Logo ── */}
        {currentStep === '2A' && (
          <form onSubmit={handleStep2ASubmit} className="settings-form-layout">
            <div className="form-group">
              <label htmlFor="wizard-firm-name" className="form-label">Firm Name</label>
              <input
                id="wizard-firm-name"
                name="firm_name"
                type="text"
                placeholder="Firm Name"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wizard-logo" className="form-label">Firm Logo Image</label>
              <input
                id="wizard-logo"
                name="logo"
                type="file"
                accept="image/*"
                className="form-input"
              />
              <span className="profile-hint">PNG or JPG logo image for documents & invoices</span>
            </div>

            <div className="form-group">
              <label htmlFor="wizard-address" className="form-label">Firm Office Address</label>
              <textarea
                id="wizard-address"
                name="address"
                placeholder="Street address, City, State..."
                className="form-input profile-textarea"
                style={{ height: '80px' }}
              />
            </div>

            <div className="profile-actions-bar" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setCurrentStep('2B')}>
                Skip for now
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Saving…' : 'Save & Continue →'}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2B: Firm Contact Info ── */}
        {currentStep === '2B' && (
          <form onSubmit={handleStep2BSubmit} className="settings-form-layout">
            <div className="form-group">
              <label htmlFor="wizard-email" className="form-label">Primary Contact Email</label>
              <input
                id="wizard-email"
                name="primary_email"
                type="email"
                placeholder="contact@yourfirm.com"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wizard-phone" className="form-label">Phone Number</label>
              <input
                id="wizard-phone"
                name="phone"
                type="tel"
                placeholder="+234 800 000 0000"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wizard-website" className="form-label">Website URL</label>
              <input
                id="wizard-website"
                name="website_url"
                type="url"
                placeholder="https://yourfirm.com"
                className="form-input"
              />
            </div>

            <div className="profile-actions-bar" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setCurrentStep('2C')}>
                Skip for now
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Saving…' : 'Save & Continue →'}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2C: Billing Defaults ── */}
        {currentStep === '2C' && (
          <form onSubmit={handleStep2CSubmit} className="settings-form-layout">
            <div className="form-group">
              <label htmlFor="wizard-currency" className="form-label">Default Invoice Currency</label>
              <select id="wizard-currency" name="invoice_currency" className="form-input">
                <option value="NGN">NGN (₦ - Nigerian Naira)</option>
                <option value="USD">USD ($ - US Dollar)</option>
                <option value="GBP">GBP (£ - British Pound)</option>
                <option value="EUR">EUR (€ - Euro)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="wizard-payment-terms" className="form-label">Default Payment Terms</label>
              <input
                id="wizard-payment-terms"
                name="default_payment_terms"
                type="text"
                defaultValue="Payment due within 14 days"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wizard-bank-details" className="form-label">Bank Account Details (Invoices)</label>
              <textarea
                id="wizard-bank-details"
                name="bank_details"
                placeholder="Bank Name, Account Number, Account Name..."
                className="form-input profile-textarea"
                style={{ height: '80px' }}
              />
            </div>

            <div className="profile-actions-bar" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setCurrentStep('3')}>
                Skip for now
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Saving…' : 'Complete Firm Setup →'}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 3: Team Invitation Prompt ── */}
        {currentStep === '3' && (
          <div className="settings-form-layout" style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
            <h2 className="page-title" style={{ fontSize: '22px', marginBottom: '8px' }}>Your Firm is Ready!</h2>
            <p className="page-subtitle" style={{ marginBottom: '24px' }}>
              Would you like to invite your first attorney or staff member to join your firm practice?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn--secondary btn--md"
                onClick={() => setShowInviteModal(true)}
              >
                + Invite Someone Now
              </button>
              <button
                type="button"
                className="btn btn--primary btn--md"
                onClick={handleFinish}
              >
                Go to Dashboard →
              </button>
            </div>

            {/* Inline Invite Modal */}
            {showInviteModal && (
              <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'left' }}>
                  <div className="modal-header">
                    <h2 className="modal-title">Invite Team Member</h2>
                    <button className="modal-close" onClick={() => setShowInviteModal(false)}>✕</button>
                  </div>

                  <form onSubmit={handleInviteSubmit}>
                    <div className="modal-body">
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Counsel John Doe"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="john@yourfirm.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <select
                          className="form-input"
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as any)}
                        >
                          <option value="attorney">Attorney</option>
                          <option value="staff">Paralegal / Staff</option>
                        </select>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button type="button" className="btn btn--ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                      <button type="submit" className="btn btn--primary" disabled={loading}>
                        {loading ? 'Sending Invite…' : 'Send Invitation'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
