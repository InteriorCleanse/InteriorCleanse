# InteriorCleanse — brand prompt system for Higgsfield

Tailored prompts for every surface of the storefront, so anyone can regenerate
or extend the imagery in the Higgsfield app (where results can be previewed)
and drop the URL into `content/catalog.json` or `content/scenes.json`.

Every prompt below is built from the same constants. Change a constant once
and every asset stays in the same world.

## Style constants (paste these into every prompt)

- **World:** a considered home — calm, sunlit, edited, nothing decorative for
  its own sake. Aesop / Jenni Kayne restraint; never a showroom, never staged.
- **Palette:** bone `#F4F0E7`, oatmeal, pale stone, plaster, a quiet brass
  `#7E6234`. Track accents: sage (mind), slate-blue (home), warm brass (body),
  soft violet (spirit). Saturation low; no pure white, no pure black.
- **Light:** soft directional daylight, long gentle shadows, morning or late
  afternoon. No studio flash, no HDR, no neon.
- **Lens:** 35mm for rooms, 50mm for objects, shallow depth of field, eye level
  or slightly below.
- **Materials:** linen, travertine, limestone, pale oak, matte stoneware,
  hand-poured wax, plaster.
- **Always append:** `no people, no text, no logos, photorealistic, no
  watermark, natural imperfections, editorial not commercial.`

Negative (if the model supports it): `stock photo, glossy, oversaturated,
HDR, neon, clutter, plastic, CGI render look, text, watermark, people`.

**Models & settings that work**
- Stills: `gpt_image_2_5`, aspect `2:3` for product/triptych, `3:2` or `16:9`
  for room scenes and OG images. ~0.25 credits each.
- Video loops: `seedance_2_5`, `16:9`, 5 s, ~35 credits each — prompt for a
  *very slow* single camera move so the loop reads seamless. Reserve for
  hero-grade shots; use the CSS "living still" drift for everything else.

## 1. Product photography (`content/catalog.json → images.hero`)

Frame: object first, in its room, on a real surface; the vessel matters as
much as the wax. `2:3`.

- **Signature candle** — "Editorial product photograph of a hand-poured
  soy-blend candle in a heavyweight matte stone-grey ceramic vessel, wax the
  colour of warm cream, a single soft flame, on a pale travertine ledge in a
  calm sunlit interior, soft window light, long shadows, palette of bone,
  oatmeal and stone. Minimal, expensive, considered. 50mm, shallow depth."
- **Ceramic mug** — "…handmade stoneware mug in a warm oatmeal reactive glaze
  on a pale travertine kitchen counter, soft morning shadow…"
- **Linen tote** — "…heavyweight natural undyed canvas tote with one small
  tonal embossed mark, resting against a pale plaster wall on a stone bench…"
- **Premium hoodie** — "…heavyweight charcoal-grey fleece hoodie folded on a
  pale oak surface in a calm sunlit interior…" (variant: worn, three-quarter
  crop, face out of frame, for the PDP gallery).
- **Art print** — "…a single framed minimalist giclée print in a thin oak
  frame on a warm off-white plaster wall, soft directional daylight, a hint
  of a considered room…"

For a **transparent cut-out** (the showroom pedestal): same object, "isolated
on plain white, soft contact shadow only", then `remove_background`.

## 2. Editorial stills (homepage triptych, journal, OG images)

`2:3` for triptych columns, `16:9` for OG.

- Console — "A pale oak console against a warm plaster wall, one candle in a
  matte stone vessel beside a short stack of linen-bound hardbacks, soft
  morning light."
- Bedroom — "A bed dressed in washed oatmeal linen, sheer curtain diffusing
  light, a ceramic cup on a travertine side table."
- Kitchen — "A pale limestone counter, a stoneware mug and folded natural
  linen, a wooden shelf with a few ceramics."
- Bath (body) — "A deep stone bath, a linen towel, a single candle, steam
  catching window light."
- Reading corner (mind) — "A linen armchair, a stack of hardbacks, a lamp
  off, afternoon light on a plaster wall."

## 3. Rooms — the living environments (`content/scenes.json`)

One environment per track and per showroom category. Stills at `16:9`; the
same prompt becomes the video prompt with a camera move appended.

| Environment | Used by | Prompt core |
| --- | --- | --- |
| atrium | hero, home | "A sunlit modern living room: low olive-green sofa, travertine coffee table, oak shelving, tall glazed doors onto a pool, warm plaster walls." |
| library | mind, books | "A floor-to-ceiling oak library, warm task light, a linen reading chair, morning light down the spines." |
| conservatory | body, wellness | "A glass-roofed conservatory, terracotta floor, large potted olive and fig, steam from a stone bath beyond." |
| chapel | spirit | "A quiet lime-washed chapel-like room, a single tall window, a bench, soft violet-grey light." |
| cleaning | cleaning | "A utility room in pale stone and oak, folded linen, glass jars, a brass tap, everything in its place." |
| atelier | merch | "A maker's studio, pale oak workbench, natural canvas rolls, brass tools, north light." |
| gallery | digital, wall-art | "A white-plaster gallery wall with three thin oak frames, concrete floor, skylight." |
| pavilion | fragrance | "An open-air stone pavilion, sheer linen curtains moving, a candle on a plinth, dusk light." |
| guestbook | partners | "A calm entry hall, a stone console, a guest book open under a lamp." |

**Video version (5 s, `seedance_2_5`, `16:9`):** append one of —
"Very slow push-in, no cuts, no people, seamless when looped." /
"Slow drift right across the room." / "Slow tilt up from floor to window
light." Keep motion under 5% of frame width so the poster and video match.

## 4. Workflow

1. Generate in the Higgsfield app (you can preview there; this build sandbox
   cannot reach the CDN).
2. Copy the CloudFront URL into `images.hero` (products) or a scene's
   `posterImage` / `desktopVideo`. The CDN is already allowed in the CSP.
3. Keep the branded tile fallback — it is what shows if a URL ever fails.
4. Never publish a stock photograph; never invent a product to fill a room.
