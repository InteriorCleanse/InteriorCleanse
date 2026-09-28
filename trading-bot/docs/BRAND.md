# Kestrel — the brand

## The name

A kestrel hunts by hovering. It holds still in the wind, watches the ground,
and drops only when the target is clear. That is the stock desk's core rule
(never force a trade; cash is a position), so the name describes the
behaviour instead of promising a result.

Tagline: **Waits for a clear edge, then acts.** Always paired with "Paper
only" wherever the app shows it. No line anywhere claims returns.

## The mark

`web/icon.svg` is the source. A cream kestrel, wings raised, with the bird's
dark malar stripes so it reads as a falcon and not a dove, on a deep teal
tile. An amber line underneath steps up once: waiting, then a single move.

| Token | Hex | Use |
|---|---|---|
| Teal tile | `#26716A` → `#11302E` | icon background, primary buttons |
| Cream | `#FBF7EF` → `#E6DCC8` | the bird |
| Ink | `#153F3C` | eyes and stripes |
| Amber | `#D9A441` | beak and the line |
| Linen | `#E8E2D7` | app background, install splash |

PNG icons (`web/icon-180.png`, `icon-192.png`, `icon-512.png`) are rendered
from the SVG with a headless browser. Re-render them after any change to the
SVG; the bird stays inside the centre 70% so the maskable crop keeps it
whole.

## Image prompt (for social posts or a hero image)

```
Minimal editorial illustration: a single kestrel hovering motionless in a
pale linen sky, wings raised, head perfectly still, looking down. Flat
shapes, cream bird with dark malar stripes, deep teal and warm amber
accents, generous empty space, fine paper grain. Calm, precise, quiet.
No text, no charts, no money, no coins, no arrows, no logos.
```

The old robot-tycoon mascot (`web/mr-cash.svg`) is retired from the header.
The file stays in the repository and is still served, so nothing that links
to it breaks.
