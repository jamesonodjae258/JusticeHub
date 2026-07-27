'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateInvoicePDFBuffer, InvoicePDFData } from '@/lib/pdfGenerator'
import { writeAuditLog } from '@/actions/audit'

export interface UnbilledTimeEntryItem {
  id: string
  date: string
  description: string
  duration_minutes: number
  rate_per_hour: number
  computed_amount: number
}

export interface CreateInvoicePayload {
  caseId: string
  clientId: string
  dueDate: string
  selectedTimeEntryIds: string[]
  customLineItems: Array<{ description: string; amount: number }>
  taxLabel: string
  taxRate: number
  paymentTerms: string
  bankDetails: string
}

/** Fetches unbilled billable time entries for a case */
export async function getUnbilledTimeEntries(caseId: string): Promise<UnbilledTimeEntryItem[]> {
  const supabase = await createClient()

  const { data: entries } = await supabase
    .from('time_entries')
    .select('id, date, entry_date, description, duration_minutes, rate_per_hour, hourly_rate')
    .eq('case_id', caseId)
    .is('invoice_id', null)
    .eq('is_billable', true)

  return (entries ?? []).map(e => {
    const rate = e.rate_per_hour || e.hourly_rate || 0
    const duration = e.duration_minutes || 0
    const computedAmount = (duration / 60.0) * rate

    return {
      id:               e.id,
      date:             e.date || e.entry_date || new Date().toISOString().split('T')[0],
      description:      e.description,
      duration_minutes: duration,
      rate_per_hour:    rate,
      computed_amount:  Math.round(computedAmount * 100) / 100,
    }
  })
}

/** Generates auto-incrementing invoice number based on firm_settings format */
export async function generateNextInvoiceNumber(firmId: string): Promise<string> {
  const adminSupabase = await createAdminClient()

  const { data: firmSett } = await adminSupabase
    .from('firm_settings')
    .select('invoice_number_format')
    .eq('firm_id', firmId)
    .maybeSingle()

  const prefix = firmSett?.invoice_number_format || 'INV-2026'

  const { count } = await adminSupabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)

  const nextSeq = (count || 0) + 1
  const paddedSeq = nextSeq.toString().padStart(3, '0')

  return `${prefix}-${paddedSeq}`
}

/** Creates invoice draft, links time entries, generates & stores PDF */
export async function createInvoiceDraft(payload: CreateInvoicePayload): Promise<{ success: boolean; invoiceId?: string; pdfUrl?: string; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin', 'attorney'].includes(userProfile.role)) {
    return { success: false, error: 'Unauthorized to generate invoices.' }
  }

  const firmId = userProfile.firm_id

  // 1. Fetch Firm & Settings details for PDF & Branding
  const { data: firm } = await adminSupabase
    .from('firm')
    .select('name')
    .eq('id', firmId)
    .single()

  const { data: firmSett } = await adminSupabase
    .from('firm_settings')
    .select('*')
    .eq('firm_id', firmId)
    .maybeSingle()

  // 2. Fetch Client Details
  const { data: client } = await adminSupabase
    .from('client')
    .select('name, email')
    .eq('id', payload.clientId)
    .single()

  if (!client) return { success: false, error: 'Client not found.' }

  // 3. Process Time Entry Line Items
  let lineItems: Array<{ description: string; durationMinutes?: number; ratePerHour?: number; amount: number; date?: string; timeEntryId?: string }> = []
  let subtotal = 0

  if (payload.selectedTimeEntryIds.length > 0) {
    const { data: selectedEntries } = await adminSupabase
      .from('time_entries')
      .select('id, date, entry_date, description, duration_minutes, rate_per_hour, hourly_rate')
      .in('id', payload.selectedTimeEntryIds)

    selectedEntries?.forEach(se => {
      const rate = se.rate_per_hour || se.hourly_rate || 0
      const duration = se.duration_minutes || 0
      const amount = Math.round(((duration / 60.0) * rate) * 100) / 100
      subtotal += amount

      lineItems.push({
        timeEntryId:     se.id,
        description:     se.description,
        durationMinutes: duration,
        ratePerHour:     rate,
        amount,
        date:            se.date || se.entry_date,
      })
    })
  }

  // 4. Custom Flat Fee Line Items
  payload.customLineItems.forEach(cli => {
    subtotal += cli.amount
    lineItems.push({
      description: cli.description,
      amount:      cli.amount,
    })
  })

  subtotal = Math.round(subtotal * 100) / 100
  const taxAmount = Math.round((subtotal * (payload.taxRate / 100.0)) * 100) / 100
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100

  // 5. Generate Invoice Number & Distinct URL Token UUID
  const invoiceNumber = await generateNextInvoiceNumber(firmId)
  const urlToken = crypto.randomUUID()

  // 6. Insert Invoice Row
  const { data: newInvoice, error: insertErr } = await adminSupabase
    .from('invoices')
    .insert({
      case_id:        payload.caseId,
      client_id:      payload.clientId,
      firm_id:        firmId,
      invoice_number: invoiceNumber,
      status:         'draft',
      issue_date:     new Date().toISOString().split('T')[0],
      due_date:       payload.dueDate,
      line_items:     lineItems,
      subtotal:       subtotal,
      tax_amount:     taxAmount,
      total_amount:   totalAmount,
      payment_terms:  payload.paymentTerms,
      bank_details:   payload.bankDetails,
      url_token:      urlToken,
    })
    .select('id')
    .single()

  if (insertErr || !newInvoice) {
    return { success: false, error: insertErr?.message || 'Failed to create invoice.' }
  }

  // 7. Lock Time Entries by setting invoice_id
  if (payload.selectedTimeEntryIds.length > 0) {
    await adminSupabase
      .from('time_entries')
      .update({ invoice_id: newInvoice.id })
      .in('id', payload.selectedTimeEntryIds)
  }

  // 8. GENERATE VECTOR PDF (< 1 second)
  const pdfData: InvoicePDFData = {
    invoiceNumber,
    issueDate:      new Date().toISOString().split('T')[0],
    dueDate:        payload.dueDate,
    firmName:       firm?.name || 'Law Firm',
    firmAddress:    firmSett?.address || null,
    firmEmail:      firmSett?.contact_email || null,
    firmPhone:      firmSett?.phone || null,
    clientName:     client.name,
    clientEmail:    client.email,
    lineItems:      lineItems,
    subtotal:       subtotal,
    taxLabel:       payload.taxLabel,
    taxRate:        payload.taxRate,
    taxAmount:      taxAmount,
    totalAmount:    totalAmount,
    paymentTerms:   payload.paymentTerms,
    bankDetails:    payload.bankDetails,
    currencySymbol: firmSett?.invoice_currency === 'USD' ? '$' : firmSett?.invoice_currency === 'GBP' ? '£' : '₦',
  }

  const pdfBuffer = await generateInvoicePDFBuffer(pdfData)
  const pdfPath = `${firmId}/${newInvoice.id}.pdf`

  // Upload to Supabase Storage bucket 'invoices'
  const { error: uploadErr } = await adminSupabase.storage
    .from('invoices')
    .upload(pdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  let finalPdfUrl: string | null = null
  if (!uploadErr) {
    // Generate 7-day signed URL for private access
    const { data: signed } = await adminSupabase.storage
      .from('invoices')
      .createSignedUrl(pdfPath, 604800)

    if (signed?.signedUrl) {
      finalPdfUrl = signed.signedUrl
      await adminSupabase
        .from('invoices')
        .update({ pdf_url: finalPdfUrl })
        .eq('id', newInvoice.id)
    }
  }

  await writeAuditLog({
    firmId:     firmId,
    actorId:    user.id,
    action:     'invoice.created',
    entityType: 'invoices',
    entityId:   newInvoice.id,
    payload:    { invoice_number: invoiceNumber, total_amount: totalAmount },
  })

  revalidatePath(`/cases/${payload.caseId}`)
  return {
    success: true,
    invoiceId: newInvoice.id,
    pdfUrl: finalPdfUrl || undefined,
  }
}

/** Mark invoice as SENT and record sent_at */
export async function sendInvoiceToClient(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin', 'attorney'].includes(userProfile.role)) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: invoice, error: fetchErr } = await adminSupabase
    .from('invoices')
    .select('id, case_id, client_id, status, invoice_number, total_amount, url_token')
    .eq('id', invoiceId)
    .eq('firm_id', userProfile.firm_id)
    .single()

  if (fetchErr || !invoice) return { success: false, error: 'Invoice not found.' }

  const nowIso = new Date().toISOString()
  const { error: updateErr } = await adminSupabase
    .from('invoices')
    .update({
      status:     'sent',
      sent_at:    nowIso,
      updated_at: nowIso,
    })
    .eq('id', invoiceId)

  if (updateErr) return { success: false, error: updateErr.message }

  // Send Notification alert to client
  const { data: client } = await adminSupabase
    .from('client')
    .select('auth_user_id')
    .eq('id', invoice.client_id)
    .single()

  if (client?.auth_user_id) {
    await adminSupabase.from('notifications').insert({
      recipient_id: client.auth_user_id,
      event_type:   'invoice.sent',
      message:      `New invoice ${invoice.invoice_number} (₦${invoice.total_amount.toLocaleString()}) issued.`,
      payload:      { invoice_id: invoice.id, url_token: invoice.url_token },
    })
  }

  await writeAuditLog({
    firmId:     userProfile.firm_id,
    actorId:    user.id,
    action:     'invoice.sent',
    entityType: 'invoices',
    entityId:   invoiceId,
    payload:    { invoice_number: invoice.invoice_number },
  })

  revalidatePath(`/cases/${invoice.case_id}`)
  return { success: true }
}

/** Mark invoice as PAID and record paid_at */
export async function markInvoiceAsPaid(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const adminSupabase = await createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { data: userProfile } = await adminSupabase
    .from('user_profile')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['super_admin', 'firm_admin', 'attorney'].includes(userProfile.role)) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: invoice } = await adminSupabase
    .from('invoices')
    .select('id, case_id, invoice_number')
    .eq('id', invoiceId)
    .eq('firm_id', userProfile.firm_id)
    .single()

  if (!invoice) return { success: false, error: 'Invoice not found.' }

  const nowIso = new Date().toISOString()
  const { error: updateErr } = await adminSupabase
    .from('invoices')
    .update({
      status:     'paid',
      paid_at:    nowIso,
      updated_at: nowIso,
    })
    .eq('id', invoiceId)

  if (updateErr) return { success: false, error: updateErr.message }

  await writeAuditLog({
    firmId:     userProfile.firm_id,
    actorId:    user.id,
    action:     'invoice.paid',
    entityType: 'invoices',
    entityId:   invoiceId,
    payload:    { invoice_number: invoice.invoice_number },
  })

  revalidatePath(`/cases/${invoice.case_id}`)
  return { success: true }
}

/** Public action for hosted invoice view (/invoice/[url_token]) */
export async function getHostedInvoiceByToken(urlToken: string) {
  const adminSupabase = await createAdminClient()

  const { data: invoice } = await adminSupabase
    .from('invoices')
    .select('*')
    .eq('url_token', urlToken)
    .maybeSingle()

  if (!invoice) return null

  // If status is currently 'sent', update to 'viewed' upon client access
  if (invoice.status === 'sent') {
    await adminSupabase
      .from('invoices')
      .update({ status: 'viewed', updated_at: new Date().toISOString() })
      .eq('id', invoice.id)

    invoice.status = 'viewed'
  }

  // Fetch Firm branding & settings
  const { data: firm } = await adminSupabase
    .from('firm')
    .select('name')
    .eq('id', invoice.firm_id)
    .single()

  const { data: firmSett } = await adminSupabase
    .from('firm_settings')
    .select('*')
    .eq('firm_id', invoice.firm_id)
    .maybeSingle()

  // Fetch Client details
  const { data: client } = await adminSupabase
    .from('client')
    .select('name, email')
    .eq('id', invoice.client_id)
    .single()

  return {
    invoice,
    firmName:     firm?.name || 'Law Firm',
    firmSettings: firmSett,
    clientName:   client?.name || 'Client',
    clientEmail:  client?.email || null,
  }
}

/** Idempotent Overdue Reminder Runner (Daily cron schedule 0 8 * * *) */
export async function processOverdueInvoiceReminders(): Promise<{ processedCount: number; errors: string[] }> {
  const adminSupabase = await createAdminClient()

  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch candidate overdue invoices
  const { data: candidateInvoices } = await adminSupabase
    .from('invoices')
    .select('id, firm_id, client_id, invoice_number, due_date, status, url_token')
    .in('status', ['sent', 'viewed'])
    .lte('due_date', sevenDaysAgo)

  let processedCount = 0
  const errors: string[] = []

  for (const inv of candidateInvoices ?? []) {
    let reminderType: '7day' | '14day' | null = null

    if (inv.due_date <= fourteenDaysAgo) {
      reminderType = '14day'
    } else if (inv.due_date <= sevenDaysAgo) {
      reminderType = '7day'
    }

    if (!reminderType) continue

    // Check if reminder for this invoice + type already exists (Idempotency check)
    const { data: existing } = await adminSupabase
      .from('invoice_reminders')
      .select('id')
      .eq('invoice_id', inv.id)
      .eq('type', reminderType)
      .maybeSingle()

    if (existing) continue // Skip duplicate

    // Insert reminder lock row (UNIQUE constraint prevents race condition)
    const { error: insertErr } = await adminSupabase
      .from('invoice_reminders')
      .insert({
        invoice_id: inv.id,
        type:       reminderType,
        sent_at:    new Date().toISOString(),
      })

    if (insertErr) {
      errors.push(`Failed to record reminder for invoice ${inv.invoice_number}: ${insertErr.message}`)
      continue
    }

    // Record reminder sent on invoice row
    await adminSupabase
      .from('invoices')
      .update({
        status:           'overdue',
        reminder_sent_at: new Date().toISOString(),
      })
      .eq('id', inv.id)

    processedCount++
  }

  return { processedCount, errors }
}

/** Fetch invoices for a case */
export async function getInvoicesForCase(caseId: string) {
  const adminSupabase = await createAdminClient()

  const { data: invoices } = await adminSupabase
    .from('invoices')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })

  return invoices ?? []
}
