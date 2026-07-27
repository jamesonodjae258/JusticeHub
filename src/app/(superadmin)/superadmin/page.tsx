import { getSuperAdminDashboardStats } from '@/actions/superadmin'

export default async function SuperAdminDashboardPage() {
  const stats = await getSuperAdminDashboardStats()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Super Admin Dashboard</h1>
          <p className="page-subtitle">Platform overview, firm metrics, and system activity</p>
        </div>
      </div>

      {stats.maintenanceMode && (
        <div className="sa-banner sa-banner--warning">
          ⚠️ <strong>Maintenance Mode Active</strong> — Non-superadmin users see a maintenance banner across the application.
        </div>
      )}

      {/* Metrics Grid */}
      <div className="sa-stats-grid">
        <div className="sa-stat-card">
          <span className="sa-stat-label">Total Firms</span>
          <span className="sa-stat-value">{stats.totalFirms}</span>
          <div className="sa-stat-breakdown">
            <span>Free: {stats.firmsByTier.free || 0}</span>
            <span>Basic: {stats.firmsByTier.basic || 0}</span>
            <span>Pro: {stats.firmsByTier.pro || 0}</span>
            <span>Enterprise: {stats.firmsByTier.enterprise || 0}</span>
          </div>
        </div>

        <div className="sa-stat-card">
          <span className="sa-stat-label">Monthly Active Users</span>
          <span className="sa-stat-value">{stats.monthlyActiveUsers}</span>
          <span className="sa-stat-sub">Logins in last 30 days</span>
        </div>

        <div className="sa-stat-card">
          <span className="sa-stat-label">Total Cases</span>
          <span className="sa-stat-value">{stats.totalCases}</span>
          <span className="sa-stat-sub">Across all registered firms</span>
        </div>

        <div className="sa-stat-card">
          <span className="sa-stat-label">Total Documents</span>
          <span className="sa-stat-value">{stats.totalDocuments}</span>
          <span className="sa-stat-sub">Stored in practice management</span>
        </div>

        <div className="sa-stat-card">
          <span className="sa-stat-label">Invoices Generated</span>
          <span className="sa-stat-value">{stats.totalInvoices}</span>
          <span className="sa-stat-sub">Platform billing count</span>
        </div>

        <div className="sa-stat-card">
          <span className="sa-stat-label">E-Signature Requests</span>
          <span className="sa-stat-value">{stats.totalSignatures}</span>
          <span className="sa-stat-sub">Document sign requests</span>
        </div>
      </div>

      {/* 90-Day New Firm Registrations Chart / Visual */}
      <div className="profile-card" style={{ marginTop: '24px' }}>
        <h2 className="profile-card-title">New Firm Registrations (Last 90 Days)</h2>
        {stats.newFirms90Days.length === 0 ? (
          <p className="profile-hint">No new firm registrations in the last 90 days.</p>
        ) : (
          <div className="sa-chart-bars">
            {stats.newFirms90Days.map((item) => (
              <div key={item.date} className="sa-chart-bar-group" title={`${item.date}: ${item.count} new firm(s)`}>
                <div
                  className="sa-chart-bar"
                  style={{ height: `${Math.min(item.count * 30, 140)}px` }}
                />
                <span className="sa-chart-label">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
