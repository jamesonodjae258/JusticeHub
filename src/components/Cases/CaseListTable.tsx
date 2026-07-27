'use client'

import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/Cases/StatusBadge'
import type { CaseStatus } from '@/types/database.types'

interface CaseRow {
  id:               string
  title:            string
  matter_type:      string
  status:           CaseStatus
  updated_at:       string
  client:           { name: string } | null
  assigned_user:    { full_name: string; avatar_signed_url?: string | null } | null
}

interface CaseListTableProps {
  cases:      CaseRow[]
  sortBy:     string
  sortDir:    'asc' | 'desc'
  onSort:     (col: string) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}

export function CaseListTable({ cases, sortBy, sortDir, onSort }: CaseListTableProps) {
  const router = useRouter()

  const arrow = (col: string) => {
    if (sortBy !== col) return null
    return <span className="sort-arrow" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="case-table-wrap">
      <table className="case-table" role="grid" aria-label="Cases">
        <thead>
          <tr>
            <th
              className={`sortable${sortBy === 'title' ? ' sort-active' : ''}`}
              onClick={() => onSort('title')}
              aria-sort={sortBy === 'title' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Title {arrow('title')}
            </th>
            <th>Client</th>
            <th>Matter Type</th>
            <th>Status</th>
            <th>Assigned To</th>
            <th
              className={`sortable${sortBy === 'updated_at' ? ' sort-active' : ''}`}
              onClick={() => onSort('updated_at')}
              aria-sort={sortBy === 'updated_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Last Updated {arrow('updated_at')}
            </th>
            <th className="case-table-action"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {cases.map(c => (
            <tr
              key={c.id}
              className="case-row"
              onClick={() => router.push(`/cases/${c.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') router.push(`/cases/${c.id}`) }}
              aria-label={`View case: ${c.title}`}
            >
              <td>{c.title}</td>
              <td className="case-client-name">{c.client?.name ?? '—'}</td>
              <td>{c.matter_type}</td>
              <td><StatusBadge status={c.status} /></td>
              <td className="case-attorney">
                {c.assigned_user?.full_name ? (
                  <div className="case-attorney-cell">
                    {c.assigned_user.avatar_signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.assigned_user.avatar_signed_url}
                        alt={c.assigned_user.full_name}
                        className="case-attorney-avatar"
                      />
                    ) : (
                      <span className="case-attorney-initial">
                        {c.assigned_user.full_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>{c.assigned_user.full_name}</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--color-border-strong)' }}>Unassigned</span>
                )}
              </td>
              <td className="case-date">{formatDate(c.updated_at)}</td>
              <td className="case-table-action">
                <span style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }} aria-hidden="true">›</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
