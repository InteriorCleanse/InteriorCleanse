/**
 * The realism layer: film grain and a vignette over AI-generated footage.
 *
 * The clips carry grain baked in; static grain over a moving image is what
 * gives a composite away, because the noise and the picture stop agreeing
 * with each other. So the grain here steps to a new position every 80ms and
 * reads as alive rather than as a texture laid on top.
 *
 * How it is drawn matters more than what it looks like. The first version
 * was a live SVG feTurbulence filter whose seed advanced twelve times a
 * second. Measured on the production build that put the main thread into
 * long tasks for 65 of a 67-second scroll — the page was a slideshow, and it
 * was this layer. Now the grain is a pre-rendered 256px tile
 * (scripts/build-grain.mjs) and the "life" is a stepped transform of that
 * tiled layer: compositor-only, no rasterisation per frame, no script. Under
 * prefers-reduced-motion the steps stop and the grain holds still.
 *
 * Both elements are aria-hidden and pointer-transparent; this is picture, not
 * interface. No client state, so it renders on the server.
 */
export function RealismLayer() {
  return (
    <>
      <div className="scene-grain" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </>
  )
}
