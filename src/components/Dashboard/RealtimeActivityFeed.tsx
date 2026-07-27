'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActivityFeedItem } from '@/actions/superAdminDashboard'

interface RealtimeActivityFeedProps {
  initialActivities: ActivityFeedItem[]
  firmId: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  })
}

export function RealtimeActivityFeed({ initialActivities, firmId }: RealtimeActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityFeedItem[]>(initialActivities)
  const [activeTab, setActiveTab] = useState<'all' | 'case' | 'document' | 'client' | 'invoice' | 'user'>('all')

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('activity-log-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
          filter: `firm_id=eq.${firmId}`,
        },
        (payload) => {
          const newRow = payload.new
          const newItem: ActivityFeedItem = {
            id:          newRow.id,
            actor_id:    newRow.actor_id,
            actor_name:  'Member',
            actor_role:  newRow.actor_role,
            action:      newRow.action,
            entity_type: newRow.entity_type,
            entity_id:   newRow.entity_id,
            metadata:    newRow.metadata,
            created_at:  newRow.created_at,
          }
          setActivities(prev => [newItem, ...prev.slice(0, 49)])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [firmId])

  const filteredActivities = activities.filter(a => {
    if (activeTab === 'all') return true
    return a.entity_type === activeTab
  })

  return (
    <div className="profile-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="profile-card-title" style={{ margin: 0 }}>
          Live Firm Activity Feed <span className="profile-hint">(Real-time)</span>
        </h2>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'case', 'document', 'client', 'user'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`btn btn--sm ${activeTab === tab ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setActiveTab(tab)}
              style={{ textTransform: 'capitalize' }}
            >
              {tab === 'all' ? 'All' : tab + 's'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
        {filteredActivities.map((act) => (
          <div
            key={act.id}
            style={{
              padding: '10px 14px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge--active">{act.action}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {act.actor_name}
                </span>
                {act.actor_role && (
                  <span className="profile-hint">({act.actor_role.replace('_', ' ')})</span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Target: {act.entity_type} {act.metadata?.title || act.metadata?.filename || act.metadata?.full_name || ''}
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {formatDate(act.created_at)}
            </div>
          </div>
        ))}

        {filteredActivities.length === 0 && (
          <p className="team-empty">No activity events found for this filter.</p>
        )}
      </div>
    </div>
  )
}
