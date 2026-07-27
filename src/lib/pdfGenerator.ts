import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface InvoicePDFData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  firmName: string
  firmAddress?: string | null
  firmEmail?: string | null
  firmPhone?: string | null
  clientName: string
  clientEmail?: string | null
  lineItems: Array<{
    description: string
    durationMinutes?: number
    ratePerHour?: number
    amount: number
    date?: string
  }>
  subtotal: number
  taxLabel?: string | null
  taxRate?: number
  taxAmount: number
  totalAmount: number
  paymentTerms?: string | null
  bankDetails?: string | null
  currencySymbol?: string
}

export async function generateInvoicePDFBuffer(data: InvoicePDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4 Page Size
  const { width, height } = page.getSize()

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const primaryColor = rgb(0.08, 0.18, 0.36) // Deep navy
  const darkTextColor = rgb(0.1, 0.1, 0.1)
  const grayTextColor = rgb(0.4, 0.4, 0.4)
  const tableHeaderBg = rgb(0.94, 0.96, 0.98)

  let y = height - 50

  // 1. HEADER & FIRM NAME
  page.drawText(data.firmName.toUpperCase(), {
    x: 40,
    y: y,
    size: 20,
    font: helveticaBold,
    color: primaryColor,
  })

  page.drawText('INVOICE', {
    x: width - 130,
    y: y,
    size: 20,
    font: helveticaBold,
    color: primaryColor,
  })

  y -= 20

  if (data.firmAddress) {
    page.drawText(data.firmAddress, {
      x: 40,
      y: y,
      size: 9,
      font: helveticaFont,
      color: grayTextColor,
    })
  }

  // Invoice Number & Dates Right Align
  page.drawText(`Invoice No: ${data.invoiceNumber}`, {
    x: width - 180,
    y: y,
    size: 10,
    font: helveticaBold,
    color: darkTextColor,
  })

  y -= 14
  page.drawText(`Issue Date: ${data.issueDate}`, {
    x: width - 180,
    y: y,
    size: 9,
    font: helveticaFont,
    color: grayTextColor,
  })

  y -= 14
  page.drawText(`Due Date: ${data.dueDate}`, {
    x: width - 180,
    y: y,
    size: 9,
    font: helveticaBold,
    color: darkTextColor,
  })

  // 2. CLIENT DETAILS (BILL TO)
  y -= 30
  page.drawText('BILL TO:', {
    x: 40,
    y: y,
    size: 10,
    font: helveticaBold,
    color: grayTextColor,
  })

  y -= 16
  page.drawText(data.clientName, {
    x: 40,
    y: y,
    size: 12,
    font: helveticaBold,
    color: darkTextColor,
  })

  if (data.clientEmail) {
    y -= 14
    page.drawText(data.clientEmail, {
      x: 40,
      y: y,
      size: 9,
      font: helveticaFont,
      color: grayTextColor,
    })
  }

  // Divider Line
  y -= 20
  page.drawLine({
    start: { x: 40, y: y },
    end: { x: width - 40, y: y },
    thickness: 1,
    color: primaryColor,
  })

  // 3. LINE ITEMS TABLE HEADER
  y -= 25
  page.drawRectangle({
    x: 40,
    y: y - 5,
    width: width - 80,
    height: 20,
    color: tableHeaderBg,
  })

  page.drawText('DESCRIPTION', { x: 50, y: y, size: 9, font: helveticaBold, color: primaryColor })
  page.drawText('HOURS', { x: 330, y: y, size: 9, font: helveticaBold, color: primaryColor })
  page.drawText('RATE', { x: 410, y: y, size: 9, font: helveticaBold, color: primaryColor })
  page.drawText('AMOUNT', { x: 490, y: y, size: 9, font: helveticaBold, color: primaryColor })

  y -= 20

  const symbol = data.currencySymbol || '₦'

  // 4. LINE ITEMS ROWS
  data.lineItems.forEach((item) => {
    if (y < 120) return // Ensure we don't overflow single page for test

    const hoursText = item.durationMinutes ? `${(item.durationMinutes / 60).toFixed(1)}h` : '-'
    const rateText = item.ratePerHour ? `${symbol}${item.ratePerHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'
    const amountText = `${symbol}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

    page.drawText(item.description.substring(0, 50), { x: 50, y: y, size: 9, font: helveticaFont, color: darkTextColor })
    page.drawText(hoursText, { x: 330, y: y, size: 9, font: helveticaFont, color: darkTextColor })
    page.drawText(rateText, { x: 410, y: y, size: 9, font: helveticaFont, color: darkTextColor })
    page.drawText(amountText, { x: 490, y: y, size: 9, font: helveticaBold, color: darkTextColor })

    y -= 18
  })

  // Table Bottom Line
  y -= 10
  page.drawLine({
    start: { x: 40, y: y },
    end: { x: width - 40, y: y },
    thickness: 0.5,
    color: grayTextColor,
  })

  // 5. TOTALS SECTION
  y -= 25
  page.drawText('Subtotal:', { x: 380, y: y, size: 10, font: helveticaFont, color: grayTextColor })
  page.drawText(`${symbol}${data.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, {
    x: 480,
    y: y,
    size: 10,
    font: helveticaFont,
    color: darkTextColor,
  })

  if (data.taxAmount > 0) {
    y -= 16
    const taxLabelText = data.taxLabel || 'Tax:'
    page.drawText(`${taxLabelText}:`, { x: 380, y: y, size: 10, font: helveticaFont, color: grayTextColor })
    page.drawText(`${symbol}${data.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, {
      x: 480,
      y: y,
      size: 10,
      font: helveticaFont,
      color: darkTextColor,
    })
  }

  y -= 20
  page.drawRectangle({
    x: 370,
    y: y - 5,
    width: width - 410,
    height: 22,
    color: tableHeaderBg,
  })

  page.drawText('TOTAL DUE:', { x: 380, y: y, size: 11, font: helveticaBold, color: primaryColor })
  page.drawText(`${symbol}${data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, {
    x: 480,
    y: y,
    size: 11,
    font: helveticaBold,
    color: primaryColor,
  })

  // 6. BANK DETAILS & PAYMENT TERMS FOOTER
  y -= 40
  if (data.paymentTerms) {
    page.drawText('PAYMENT TERMS:', { x: 40, y: y, size: 9, font: helveticaBold, color: grayTextColor })
    y -= 12
    page.drawText(data.paymentTerms.substring(0, 100), { x: 40, y: y, size: 9, font: helveticaFont, color: darkTextColor })
    y -= 20
  }

  if (data.bankDetails) {
    page.drawText('BANK DETAILS FOR PAYMENT:', { x: 40, y: y, size: 9, font: helveticaBold, color: grayTextColor })
    y -= 12
    page.drawText(data.bankDetails.substring(0, 100), { x: 40, y: y, size: 9, font: helveticaFont, color: darkTextColor })
  }

  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}
