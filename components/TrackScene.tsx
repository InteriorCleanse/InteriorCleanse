import { SceneBackground } from '@/components/hero/SceneBackground'
import type { Scene } from '@/lib/scenes'

/**
 * A living room behind a track section.
 *
 * The four tracks used to be flat colour bands. Each now carries the real
 * footage of the environment it belongs to (mind → library, home → atrium,
 * body → conservatory, spirit → chapel) under a translucent veil tinted with
 * that track's own colour. The veil is what keeps the section readable: the
 * room breathes softly beneath it, and the dark ink on top still clears AA by
 * a wide margin. Decorative, so the whole layer is aria-hidden. Phones get the
 * poster with its camera drift rather than the video, as every scene does.
 */
export function TrackScene({ scene }: { scene?: Scene }) {
  if (!scene) return null
  return (
    <div className="track-scene" aria-hidden="true">
      <SceneBackground
        desktopVideo={scene.desktopVideo ?? undefined}
        mobileVideo={scene.mobileVideo ?? undefined}
        webmVideo={scene.webmVideo ?? undefined}
        posterImage={scene.posterImage ?? undefined}
        posterMotion={scene.posterMotion ?? undefined}
        reducedMotionPoster={scene.reducedMotionPoster ?? undefined}
      />
      <span className="track-scene-veil" />
    </div>
  )
}
