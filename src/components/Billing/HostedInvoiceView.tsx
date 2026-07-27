'use client'

interface HostedInvoiceViewProps {
  invoice: any
  firmName: string
  firmSettings: any
  clientName: string
  clientEmail: string | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function HostedInvoiceView({
  invoice,
  firmName,
  firmSettings,
  clientName,
  clientEmail,
}: HostedInvoiceViewProps) {
  const allowDownload = firmSettings?.allow_client_download ?? false
  const currencySymbol = firmSettings?.invoice_currency === 'USD' ? '$' : firmSettings?.invoice_currency === 'GBP' ? '£' : '₦'

  const lineItems: any[] = Array.isArray(invoice.line_items) ? invoice.line_items : []

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '24px 16px', color: '#0F172A', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
        
        {/* Top Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1E293B' }}>{firmName}</h1>
            {firmSettings?.address && <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>{firmSettings.address}</p>}
            {firmSettings?.contact_email && <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>{firmSettings.contact_email}</p>}
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: invoice.status === 'paid' ? '#DCFCE7' : invoice.status === 'overdue' ? '#FEE2E2' : '#E0F2FE',
                color: invoice.status === 'paid' ? '#166534' : invoice.status === 'overdue' ? '#991B1B' : '#075985',
              }}
            >
              {invoice.status}
            </span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', marginTop: '6px' }}>
              {invoice.invoice_number}
            </div>
          </div>
        </div>

        {/* Invoice Metadata */}
        <div style={{ padding: '20px 24px', background: '#F1F5F9', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', fontSize: '13px' }}>
          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Billed To</span>
            <strong style={{ color: '#0F172A' }}>{clientName}</strong>
            {clientEmail && <div style={{ fontSize: '12px', color: '#64748B' }}>{clientEmail}</div>}
          </div>

          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Issue Date</span>
            <strong>{formatDate(invoice.issue_date)}</strong>
          </div>

          <div>
            <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Due Date</span>
            <strong>{formatDate(invoice.due_date)}</strong>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ padding: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '8px 0', fontWeight: 600 }}>Description</th>
                <th style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 0', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{item.description}</div>
                    {item.durationMinutes && (
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {(item.durationMinutes / 60).toFixed(1)}h @ {currencySymbol}{item.ratePerHour}/hr
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#0F172A' }}>
                    {currencySymbol}{item.amount?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ marginTop: '24px', marginLeft: 'auto', maxWidth: '260px', borderTop: '2px solid #E2E8F0', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>
              <span>Subtotal</span>
              <span>{currencySymbol}{invoice.subtotal?.toLocaleString()}</span>
            </div>

            {invoice.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>
                <span>Tax</span>
                <span>{currencySymbol}{invoice.tax_amount?.toLocaleString()}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#0F172A', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
              <span>Total Due</span>
              <span>{currencySymbol}{invoice.total_amount?.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Bank & Payment Details */}
        <div style={{ padding: '20px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#475569' }}>
          {invoice.payment_terms && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#1E293B', display: 'block', marginBottom: '2px' }}>Payment Terms:</strong>
              {invoice.payment_terms}
            </div>
          )}

          {invoice.bank_details && (
            <div>
              <strong style={{ color: '#1E293B', display: 'block', marginBottom: '2px' }}>Bank Account Details for Payment:</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{invoice.bank_details}</div>
            </div>
          )}
        </div>

        {/* Conditional PDF Download Button (Hidden if allow_client_download is false) */}
        {allowDownload && invoice.pdf_url && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
            <a
              href={invoice.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: '#0F172A',
                color: '#FFFFFF',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              📥 Download PDF Copy
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
