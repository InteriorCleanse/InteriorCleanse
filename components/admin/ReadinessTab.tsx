'use client'

import { renderReadinessReport, type ReadinessIssue } from '@/lib/render-readiness'

const ISSUE_LABEL: Record<ReadinessIssue, string> = {
  missing_poster: 'No poster or hero image',
  declared_3d_without_assets: 'Declared true 3D but has no model',
  declared_spin_without_frames: 'Declared 360 spin but has fewer than 2 frames',
  unresolved_channel_link: 'Channel link still says TODO',
  no_stripe_price: 'No Stripe Price — cannot be sold',
  external_without_url: 'External checkout with no purchase URL',
}

const MODE_LABEL: Record<string, string> = {
  true_3d: 'True 3D',
  spin_360: '360 spin',
  depth_interactive: 'Depth (fallback)',
}

/**
 * The 3D readiness report.
 *
 * Derived entirely from product data at render time, so it cannot drift out of
 * sync with what the storefront actually does — there is no separate status
 * table to forget to update.
 */
export function ReadinessTab() {
  const { rows, counts } = renderReadinessReport()

  return (
    <section>
      <div className="admin-stats">
        <div className="admin-stat">
          <p className="admin-stat-label">Products</p>
          <p className="admin-stat-value">{counts.total}</p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">True 3D</p>
          <p className="admin-stat-value">{counts.true3d}</p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">360 spin</p>
          <p className="admin-stat-value">{counts.spin360}</p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">Depth fallback</p>
          <p className="admin-stat-value">{counts.depth}</p>
        </div>
        <div className="admin-stat">
          <p className="admin-stat-label">With issues</p>
          <p className="admin-stat-value">{counts.withIssues}</p>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Render mode</th>
              <th>Geometry</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug}>
                <td>{row.name}</td>
                <td>{MODE_LABEL[row.mode] ?? row.mode}</td>
                <td>{row.procedural ? 'Procedural mesh' : 'Model file'}</td>
                <td>
                  {row.issues.length === 0 ? (
                    <span className="readiness-ok">Ready</span>
                  ) : (
                    <ul className="readiness-issues">
                      {row.issues.map((issue) => (
                        <li key={issue}>{ISSUE_LABEL[issue]}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="readiness-note">
        Derived from <code>content/products.json</code> on every render. To upgrade a
        product from depth to 360 or true 3D, add <code>spinFrames</code> or{' '}
        <code>modelUrl</code> and set <code>renderMode</code> — no deploy of component code
        is required.
      </p>
    </section>
  )
}
