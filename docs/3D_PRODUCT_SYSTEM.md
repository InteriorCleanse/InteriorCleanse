# The 3D Product System

One component renders every sellable object on the site. Which of the three
modes it uses is a property of the **product data**, never of the route file —
so a product upgrades from a flat image to a true 3D model with a content edit
and no deploy.

## The three modes

| Mode | Requires | Interaction | Honest label |
| --- | --- | --- | --- |
| `true_3d` | An optimized `.glb`/`.gltf` | Orbit, constrained rotation, variant materials, hotspots | Genuine 3D |
| `spin_360` | An ordered frame sequence (turntable) | Drag to rotate, pointer preview, scroll-advance in feature sections | Genuine photography of the real product |
| `depth_interactive` | One accurate product image | Pointer-tracked tilt, layer parallax, hover lift | **A fallback.** Not 3D, and never described as such |

Every product ships at least `depth_interactive`. Nothing is allowed to be flat.
Priority products get `spin_360` or `true_3d`.

### Why Mode C is the default, not the exception

The brief's hard constraint is that a product grid must never spin up a WebGL
canvas per card. Mode C is pure CSS transforms and pointer maths — it costs
nothing, works with no GPU, works with no WebGL at all, and looks dimensional.
So the grid is entirely Mode C; the heavy renderers live on the detail page and
on at most one in-view feature slot.

## Data contract

Added to `Product` in `lib/types.ts`:

```ts
renderMode?: 'true_3d' | 'spin_360' | 'depth_interactive'  // default: depth_interactive
modelUrl?: string        // Mode A
posterUrl?: string       // shown before any heavy renderer boots; also the no-WebGL fallback
spinFrames?: string[]    // Mode B, in rotation order
depthLayers?: {          // Mode C; omit and the hero image is used as a single layer
  src: string
  depth: number          // 0 = background (still), 1 = foreground (most travel)
}[]
scenePreset?: ScenePreset
```

`viewer` is retained untouched for backward compatibility with the existing
`ProductStage`; `renderMode` is the forward-looking field and takes precedence.

## Category experience registry

`lib/category-experience.ts` maps a category to its art direction. Adding a
category means adding a record — no component changes.

Each record declares: `scenePreset`, `defaultRenderMode`, `tiltRange` (degrees
of pointer travel), `liftPx`, `backgroundTreatment`, `accent`, and
`autoRotate`. The values are deliberately restrained — books tilt further than
candles because a book cover reads as a plane and needs the angle to show
thickness; a candle only needs a suggestion of turn.

## Component tree

```
ProductExperience            server-safe dispatcher, picks a mode
├── DepthInteractive         Mode C — CSS only, no WebGL, no dynamic import
├── Spin360                  Mode B — drag/keyboard through a frame sequence
└── ProductStageLoader       Mode A — existing r3f viewer, dynamically imported
```

`ProductExperience` never imports the r3f bundle unless the resolved mode is
`true_3d`, so a Mode C page never pays for Three.js.

## Accessibility and motion rules

These are requirements, not polish:

- **Focus parity with hover.** Every card responds to `:focus-within`, not only
  `:hover`. A keyboard user sees the same lift.
- **Keyboard rotation.** `Spin360` is a `role="slider"` with `ArrowLeft`/
  `ArrowRight` stepping one frame and `Home` resetting. It is reachable and
  operable without a pointer.
- **`prefers-reduced-motion: reduce` disables all of it.** Tilt, parallax,
  lift, and autoplay all stop; the product renders as a clean static image.
  This is checked in JS (`matchMedia`) as well as CSS, because a transform
  driven by a pointer handler cannot be stopped by a media query alone.
- **Coarse pointers get controls, not hover.** `(pointer: coarse)` devices lose
  tilt entirely and gain drag on Mode B, since hover does not exist there.
- **No information lives only in motion.** Everything a hotspot or reveal shows
  is also present in the static product copy below the stage.

## Performance rules

- One heavy viewer per visible experience. Never one per card.
- Poster first, renderer second. The poster is a normal `<img>` so it is in the
  HTML and paints before any JavaScript.
- Intersection observers pause offscreen animation.
- Device pixel ratio capped at 2 (`dpr={[1, 2]}` — already the case in
  `ProductStage`).
- Three.js and Babylon are dynamically imported and never enter the shared chunk.
- WebGL failure falls through to the poster. The store stays shoppable.

## Asset optimization targets

For any model added later: glTF/GLB container, Draco or Meshopt geometry
compression, KTX2/Basis textures, baked lighting where the object allows it,
real-time lights kept to the three already in `ProductStage`, and a compressed
poster at the same aspect ratio as the canvas to eliminate layout shift.

## Readiness reporting

`lib/render-readiness.ts` derives, from product data alone: which products have
true 3D, which have a spin sequence, which are on the depth fallback, which are
missing a poster, and which have a dead external link. The admin surface renders
this; no separate tracking table is needed because the product data *is* the
source of truth.
