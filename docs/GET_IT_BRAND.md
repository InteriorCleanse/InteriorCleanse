# Get-it Brand Kit

Get-it is the fitness app. Palette and type are defined in
`BASE44_GET_IT_FITNESS_APP_PROMPT.md` ("Ember on Graphite").

## Logo files (vector, final)

- `public/brand/get-it-logo.svg` — app icon. A bone-white G drawn as a
  progress ring that is almost complete, closed by an ember dot. Export at
  1024 px for the App Store, 512 px for Play, 180 px for iOS home screen.
- `public/brand/get-it-wordmark.svg` — horizontal lockup. The hyphen is an
  upward Ember tick; the i carries an Amber dot. Set in Space Grotesk Bold;
  install the font before exporting or the fallback sans will render.

## Logo concepts (Higgsfield, for comparison)

Three raster explorations, 2K, in your Higgsfield library:

| Concept | Job id |
| --- | --- |
| Progress-ring G with ember dot (matches the SVG) | `701d9e23-c6b1-49b4-a88a-62bdf52454a2` |
| Stacked chevrons reading as G and ascent | `76e1aa93-cef8-4c9e-af01-aff49c83f2cd` |
| Wordmark with tick hyphen | `6b8f6da8-a063-4434-b509-361b9357cb2d` |

The SVG is the source of truth; the raster concepts are for taste checks
only. If the chevron concept wins, rebuild it as SVG before use.

## Usage rules

- Icon and wordmark only on Graphite `#111214` or Bone `#F4F1EC`.
  On Bone, invert the G to Ink and keep the ember dot.
- Minimum clear space: the height of the ember dot on all sides.
- Never stretch, outline, add a drop shadow, or place on a photo without a
  Graphite scrim.
