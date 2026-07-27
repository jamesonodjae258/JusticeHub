import { getEmailTemplates } from '@/actions/superadmin'
import { EmailTemplatesEditor } from '@/components/SuperAdmin/EmailTemplatesEditor'

export default async function SuperAdminEmailTemplatesPage() {
  const templates = await getEmailTemplates()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="page-subtitle">View and edit system-wide transactional email templates and placeholders</p>
        </div>
      </div>

      <EmailTemplatesEditor templates={templates} />
    </div>
  )
}
