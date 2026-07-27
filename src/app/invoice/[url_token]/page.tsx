import { notFound } from 'next/navigation'
import { getHostedInvoiceByToken } from '@/actions/invoices'
import { HostedInvoiceView } from '@/components/Billing/HostedInvoiceView'

interface HostedInvoicePageProps {
  params: Promise<{ url_token: string }>
}

export default async function HostedInvoicePage({ params }: HostedInvoicePageProps) {
  const resolvedParams = await params
  const urlToken = resolvedParams.url_token

  const data = await getHostedInvoiceByToken(urlToken)
  if (!data || !data.invoice) {
    notFound()
  }

  return (
    <HostedInvoiceView
      invoice={data.invoice}
      firmName={data.firmName}
      firmSettings={data.firmSettings}
      clientName={data.clientName}
      clientEmail={data.clientEmail}
    />
  )
}
