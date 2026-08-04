/**
 * InteriorCleanse Spline 3D scene URLs.
 *
 * To update a scene:
 * 1. Open spline.design and edit the scene.
 * 2. Export -> Code Export -> Update Code Export.
 * 3. Copy the prod.spline.design/.../scene.splinecode URL below.
 * 4. Commit -> the site picks it up on the next deploy.
 *
 * Re-publishing an existing scene keeps the same URL, so visual tweaks
 * usually need no code change at all.
 *
 * The free Spline tier renders a small "Built with Spline" badge on embeds.
 */
export const SPLINE_SCENES={
  // Homepage hero: brass + sage rings, faceted prism and orb on near-black.
  hero:'https://prod.spline.design/4kC3S0W0i9pUQtPH/scene.splinecode',
} as const

export type SplineSceneName=keyof typeof SPLINE_SCENES
