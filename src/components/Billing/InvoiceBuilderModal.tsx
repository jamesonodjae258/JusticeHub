'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  getUnbilledTimeEntries,
  createInvoiceDraft,
  UnbilledTimeEntryItem,
} from '@/actions/invoices'
import { getFirmSettings, FirmSettingsData } from '@/actions/firmSettings'

interface InvoiceBuilderModalProps {
  caseId: string
  clientId: string
  clientName: string
  caseTitle: string
  onClose: () => void
}

export function InvoiceBuilderModal({
  caseId,
  clientId,
  clientName,
  caseTitle,
  onClose,
}: InvoiceBuilderModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [createdPdfUrl, setCreatedPdfUrl] = useState<string | null>(null)

  // Data sources
  const [unbilledEntries, setUnbilledEntries] = useState<UnbilledTimeEntryItem[]>([])
  const [firmSettings, setFirmSettings] = useState<FirmSettingsData | null>(null)

  // Form selections
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])
  const [customItems, setCustomItems] = useState<Array<{ description: string; amount: number }>>([])
  const [newCustomDesc, setNewCustomDesc] = useState('')
  const [newCustomAmount, setNewCustomAmount] = useState('')

  // Invoice Fields
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [taxLabel, setTaxLabel] = useState('VAT 7.5%')
  const [taxRate, setTaxRate] = useState(7.5)
  const [paymentTerms, setPaymentTerms] = useState('Net 14 Days')
  const [bankDetails, setBankDetails] = useState('')

  // Load unbilled entries and firm defaults
  useEffect(() => {
    async function loadData() {
      const [entries, settings] = await Promise.all([
        getUnbilledTimeEntries(caseId),
        getFirmSettings(),
      ])

      setUnbilledEntries(entries)
      setSelectedEntryIds(entries.map(e => e.id)) // Default select all

      if (settings) {
        setFirmSettings(settings)
        setTaxLabel(settings.tax_label || 'VAT 7.5%')
        setTaxRate(settings.tax_rate ?? 7.5)
        setPaymentTerms(settings.payment_terms || 'Net 14 Days')
        setBankDetails(settings.bank_details || '')
      }

      setLoading(false)
    }
    loadData()
  }, [caseId])

  // Calculations
  const selectedEntries = unbilledEntries.filter(e => selectedEntryIds.includes(e.id))
  const timeEntriesSubtotal = selectedEntries.reduce((sum, e) => sum + e.computed_amount, 0)
  const customSubtotal = customItems.reduce((sum, item) => sum + item.amount, 0)
  const subtotal = Math.round((timeEntriesSubtotal + customSubtotal) * 100) / 100
  const taxAmount = Math.round((subtotal * (taxRate / 100.0)) * 100) / 100
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100

  function toggleSelectAll(checked: boolean) {
    if (checked) setSelectedEntryIds(unbilledEntries.map(e => e.id))
    else setSelectedEntryIds([])
  }

  function toggleSelectEntry(id: string) {
    setSelectedEntryIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  function handleAddCustomItem() {
    if (!newCustomDesc.trim() || !newCustomAmount || parseFloat(newCustomAmount) <= 0) return
    setCustomItems(prev => [...prev, { description: newCustomDesc.trim(), amount: parseFloat(newCustomAmount) }])
    setNewCustomDesc('')
    setNewCustomAmount('')
  }

  function handleRemoveCustomItem(index: number) {
    setCustomItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleGenerateInvoice() {
    if (selectedEntryIds.length === 0 && customItems.length === 0) {
      setErrorMsg('Please select at least one time entry or add a custom line item.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')

    const startTime = performance.now()

    const res = await createInvoiceDraft({
      caseId,
      clientId,
      dueDate,
      selectedTimeEntryIds: selectedEntryIds,
      customLineItems: customItems,
      taxLabel,
      taxRate,
      paymentTerms,
      bankDetails,
    })

    const elapsed = Math.round(performance.now() - startTime)
    console.log(`[PDF Generator] Completed in ${elapsed}ms`)

    setSubmitting(false)

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to generate invoice.')
    } else {
      setCreatedPdfUrl(res.pdfUrl || null)
      router.refresh()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '90%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Generate Invoice — {caseTitle}</h2>
            <span className="profile-hint">Client: {clientName}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
              Loading unbilled time entries & firm settings...
            </p>
          ) : createdPdfUrl ? (
            /* ── SUCCESS STATE WITH STORED PDF LINK ── */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Invoice & Vector PDF Generated Successfully!
              </h3>
              <p className="profile-hint" style={{ marginTop: '8px', marginBottom: '20px' }}>
                PDF saved to private Supabase Storage bucket. Associated time entries are now locked.
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <a
                  href={createdPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--primary btn--md"
                >
                  👁 Open Stored PDF Invoice
                </a>
                <button type="button" className="btn btn--secondary btn--md" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div>
              {errorMsg && <div className="team-error" style={{ marginBottom: '16px' }}>{errorMsg}</div>}

              {/* ── 1. UNBILLED TIME ENTRIES ── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                    1. Select Unbilled Time Entries ({unbilledEntries.length})
                  </h3>
                  <label className="checkbox-label" style={{ fontSize: '12px' }}>
                    <input
                      type="checkbox"
                      checked={selectedEntryIds.length === unbilledEntries.length && unbilledEntries.length > 0}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                    <span>Select All</span>
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {unbilledEntries.map(e => (
                    <label
                      key={e.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'var(--color-surface)',
                        border: '0.5px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={selectedEntryIds.includes(e.id)}
                          onChange={() => toggleSelectEntry(e.id)}
                        />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{e.description}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            {e.date} • {Math.floor(e.duration_minutes / 60)}h {e.duration_minutes % 60}m @ ₦{e.rate_per_hour}/hr
                          </div>
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-primary)' }}>
                        ₦{e.computed_amount.toLocaleString()}
                      </div>
                    </label>
                  ))}

                  {unbilledEntries.length === 0 && (
                    <p className="team-empty">No unbilled time entries available for this case.</p>
                  )}
                </div>
              </div>

              {/* ── 2. CUSTOM FLAT FEE ITEMS ── */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
                  2. Add Custom / Flat-Fee Line Items
                </h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Description (e.g. Court filing fee)"
                    className="form-input"
                    value={newCustomDesc}
                    onChange={(e) => setNewCustomDesc(e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="Amount (₦)"
                    className="form-input"
                    value={newCustomAmount}
                    onChange={(e) => setNewCustomAmount(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn--secondary btn--sm" onClick={handleAddCustomItem}>
                    + Add
                  </button>
                </div>

                {customItems.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 12px',
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <span>{item.description}</span>
                    <div>
                      <span style={{ fontWeight: 600, marginRight: '12px' }}>₦{item.amount.toLocaleString()}</span>
                      <button type="button" onClick={() => handleRemoveCustomItem(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'red' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── 3. INVOICE PARAMETERS ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Terms</label>
                  <input
                    type="text"
                    className="form-input"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tax Label</label>
                  <input
                    type="text"
                    className="form-input"
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* ── 4. REAL-TIME TOTALS BREAKDOWN ── */}
              <div style={{ padding: '16px', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 600 }}>₦{subtotal.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span>{taxLabel} ({taxRate}%):</span>
                  <span style={{ fontWeight: 600 }}>₦{taxAmount.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)', paddingTop: '8px', borderTop: '0.5px solid var(--color-border)' }}>
                  <span>TOTAL DUE:</span>
                  <span>₦{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!createdPdfUrl && (
          <div className="modal-footer">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleGenerateInvoice}
              disabled={submitting || (selectedEntryIds.length === 0 && customItems.length === 0)}
            >
              {submitting ? 'Generating Vector PDF...' : '📄 Generate PDF Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
