# Get-it Brand Kit

Get-it is the fitness app. Palette and type are defined in
`BASE44_GET_IT_FITNESS_APP_PROMPT.md` ("Ember on Graphite").

## Approved logo (10 September 2026)

The owner approved the Higgsfield wordmark concept `6b8f6da8…`: bone-white
"Get" and "it" in a bold geometric grotesque, an ember tilted bar for the
hyphen, and an amber glowing dot on the i. It has been rebuilt as vector:

- `public/brand/get-it-wordmark.svg` — the wordmark, 1400 × 520. Set in
  Bricolage Grotesque or Space Grotesk; install one before exporting or
  the fallback sans will render.
- `public/brand/get-it-logo.svg` — the app icon: the G with the same tick
  and dot inside its counter on Graphite. Export at 1024 px for the App
  Store, 512 px for Play, 180 px for the iOS home screen.

The design system built around the logo is in
`BASE44_GET_IT_UI_AND_TIERS_PROMPT.md` and the live Get-it Design System
artifact.

## Logo concepts (Higgsfield, for comparison)

Three raster explorations, 2K, in your Higgsfield library:

| Concept | Job id |
| --- | --- |
| Progress-ring G with ember dot (matches the SVG) | `701d9e23-c6b1-49b4-a88a-62bdf52454a2` |
| Stacked chevrons reading as G and ascent | `76e1aa93-cef8-4c9e-af01-aff49c83f2cd` |
| Wordmark with tick hyphen | `6b8f6da8-a063-4434-b509-361b9357cb2d` |

## Refinements of the chosen wordmark concept

The wordmark concept (`6b8f6da8…`) was picked as the direction. Four
refinements were generated from it as an image reference:

| Refinement | Job id |
| --- | --- |
| Final dark wordmark, cleaned spacing and alignment | `a03cede7-341c-44af-a6e5-fa50192d3751` |
| Matching app icon: the G with the tick and dot in its counter | `1da613d4-fcb2-4699-af31-cf33eea41b8d` |
| Light-background wordmark (Graphite on Bone) | `6e61ae4d-cc7b-4976-b1b2-8b72cc91c10d` |
| App Store screenshot mock-up using the wordmark | `7462aad4-972f-4704-a28d-3bdedf631c36` |

The raster files are for approval and mock-ups. Once one is approved,
rebuild it as SVG (update `get-it-wordmark.svg` and `get-it-logo.svg`) so
the shipped logo is vector and pixel-exact at every size.

## Usage rules

- Icon and wordmark only on Graphite `#111214` or Bone `#F4F1EC`.
  On Bone, invert the G to Ink and keep the ember dot.
- Minimum clear space: the height of the ember dot on all sides.
- Never stretch, outline, add a drop shadow, or place on a photo without a
  Graphite scrim.
