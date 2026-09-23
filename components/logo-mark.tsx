import Link from 'next/link'
import { BRAND_NAME } from '@/lib/site-config'

/**
 * The header lockup: vase-and-rose mark, hairline rule, two-line wordmark.
 *
 * Cut from the master artwork by `scripts/build-brand.py`, not redrawn — the
 * compact lockup at the foot of the master is the approved horizontal form.
 * It ships at 2x (288x88) and is displayed at 44px tall, so it stays crisp on
 * retina without shipping the 1.2MB master.
 *
 * `logo-mark-dark.png` is retired; the original master is preserved untouched
 * in `source-assets/`.
 */
export function LogoMark() {
  return (
    <Link href="/" className="logo-lockup" aria-label={`${BRAND_NAME} — home`}>
      {/* Two cuts of the same lockup. The dark-ink cut is shown on the solid
          cream header; the light-ink cut is swapped in by CSS while the header
          floats transparent over a dark hero. Both ship so the swap never
          waits on a second request. */}
      <img
        className="logo-img logo-img-solid"
        src="/brand/header-lockup-light.png"
        alt={BRAND_NAME}
        width={288}
        height={88}
        fetchPriority="high"
      />
      <img
        className="logo-img logo-img-over"
        src="/brand/header-lockup-dark.png"
        alt=""
        aria-hidden="true"
        width={288}
        height={88}
        fetchPriority="high"
      />
    </Link>
  )
}
