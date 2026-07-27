import { getFeatureFlags } from '@/actions/superadmin'
import { FeatureFlagsForm } from '@/components/SuperAdmin/FeatureFlagsForm'

export default async function SuperAdminFeatureFlagsPage() {
  const flags = await getFeatureFlags()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Feature Flags & Maintenance Mode</h1>
          <p className="page-subtitle">Control global platform module availability and maintenance banners</p>
        </div>
      </div>

      <FeatureFlagsForm flags={flags} />
    </div>
  )
}
