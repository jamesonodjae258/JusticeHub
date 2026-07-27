'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEmailTemplate } from '@/actions/superadmin'
import type { PlatformEmailTemplateRow } from '@/types/database.types'

interface EmailTemplatesEditorProps {
  templates: PlatformEmailTemplateRow[]
}

const VARIABLES = ['{{firm_name}}', '{{client_name}}', '{{case_name}}', '{{link}}']

export function EmailTemplatesEditor({ templates }: EmailTemplatesEditorProps) {
  const router = useRouter()
  const [selectedKey, setSelectedKey] = useState(templates[0]?.template_key || 'invite')
  const activeTemplate = templates.find(t => t.template_key === selectedKey) || templates[0]

  const [subject, setSubject] = useState(activeTemplate?.subject ?? '')
  const [bodyHtml, setBodyHtml] = useState(activeTemplate?.body_html ?? '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleSelectTemplate(key: string) {
    setSelectedKey(key)
    const t = templates.find(item => item.template_key === key)
    if (t) {
      setSubject(t.subject)
      setBodyHtml(t.body_html)
    }
  }

  function insertVariable(variable: string) {
    setBodyHtml(prev => prev + ' ' + variable)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTemplate) return
    setMsg(null)
    setLoading(true)

    const res = await updateEmailTemplate(activeTemplate.template_key, subject, bodyHtml)
    setLoading(false)

    if (res.error) {
      setMsg({ type: 'error', text: res.error })
    } else {
      setMsg({ type: 'success', text: 'Email template saved successfully!' })
      router.refresh()
    }
  }

  return (
    <div className="profile-card" style={{ maxWidth: '840px' }}>
      <h2 className="profile-card-title">Platform Email Templates</h2>

      <div className="settings-tabs" style={{ marginBottom: '20px' }}>
        {templates.map((tmpl) => (
          <button
            key={tmpl.template_key}
            type="button"
            className={`settings-tab ${selectedKey === tmpl.template_key ? 'settings-tab--active' : ''}`}
            onClick={() => handleSelectTemplate(tmpl.template_key)}
          >
            {tmpl.name}
          </button>
        ))}
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'team-error' : 'profile-success-toast'} style={{ marginBottom: '16px' }}>
          {msg.text}
        </div>
      )}

      {activeTemplate && (
        <form onSubmit={handleSubmit} className="settings-form-layout">
          <div className="sa-template-note">
            💡 <strong>Firm-Level Overrides Note:</strong> Individual firms can configure custom portal messages in <code>firm_settings</code> which override default text.
          </div>

          <div className="form-group">
            <label htmlFor="email-subject" className="form-label">Subject Line</label>
            <input
              id="email-subject"
              type="text"
              className="form-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <div className="profile-label-row">
              <label htmlFor="email-body" className="form-label">HTML Body Content</label>
              <div className="sa-var-chips">
                <span className="profile-hint" style={{ marginRight: '4px' }}>Variables:</span>
                {VARIABLES.map(v => (
                  <button
                    key={v}
                    type="button"
                    className="chip btn--sm"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => insertVariable(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="email-body"
              className="form-input profile-textarea"
              style={{ height: '220px' }}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              required
            />
          </div>

          <div className="profile-actions-bar">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Saving template…' : 'Save Email Template'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
