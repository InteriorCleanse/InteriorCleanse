# Mr. Cash — mascot master prompt

A reusable prompt for Higgsfield (or any image model) that keeps the mascot
consistent across the logo, app icon, social posts and video.

**The character is original.** Mr. Cash borrows the old-money tycoon look that
belongs to nobody (top hat, monocle, handlebar mustache, tailcoat, cane) and
makes it a robot. It must not copy Hasbro's Monopoly mascot (Rich Uncle
Pennybags): no white walrus mustache on a round human face, no Monopoly
wording, board, colours or money. An exact copy could not be trademarked by
us, could be taken down from an app store, and would make the brand look
borrowed. Keep the "No …" line at the end of every prompt.

## Master prompt

```
Mascot for "Mr. Cash", an ORIGINAL robopunk tycoon character (not any existing
brand mascot). A friendly chrome-and-gunmetal robot gentleman. Tall black silk
top hat with a thin glowing mint-green (#34d399) neon band. One round
holographic monocle lens over the right eye that projects a tiny floating green
candlestick chart. A big sweeping handlebar mustache made of brushed-silver
steel filaments. Rounded friendly face plate, two soft cyan LED eyes, a warm
confident smile. Black tailcoat with satin lapels, a mint pocket square and a
small black bow tie; one gloved robotic hand resting on a slim black cane
topped with a glowing emerald orb. Holographic finish: iridescent mint-to-cyan
sheen on the chrome, faint scanlines, delicate glitch fringing at the edges,
soft volumetric glow. Crisp studio lighting, subtle 3D depth.
[SHOT]
Background: deep navy-black #080b11 with a soft mint radial glow.
No text, no letters, no numbers, no logos, no board-game elements, no dollar
signs, no paper money.
```

## Replace `[SHOT]` with one of these

| Use | `[SHOT]` | Aspect |
|---|---|---|
| Logo / avatar | `Bust portrait, three-quarter view, centred. Bold clean silhouette that still reads at 32 pixels, premium fintech app-icon quality.` | 1:1 |
| App icon | `Head and hat only, front view, filling 80% of a rounded-square tile. Flat enough to read at 29 pixels; no cane, no hands.` | 1:1 |
| Hero / banner | `Full figure standing beside a floating holographic trading screen of green and red candles, one hand tipping the hat. Wide cinematic framing, figure on the left third.` | 16:9 |
| Sticker | `Full figure, winking, tipping the hat, thick clean outline, sticker style, transparent-looking plain background.` | 1:1 |
| Video (image-to-video) | Start from the chosen logo image; motion prompt: `He tips his hat, the monocle chart flickers and redraws, the neon band pulses once, subtle idle breathing. Camera still. 4 seconds, seamless loop.` | 1:1 |

## Keeping him consistent

1. Pick the variant you like best and keep its job id.
2. Pass that image as a reference for every later generation (the image
   reference in Higgsfield) and keep the master prompt word for word. Only
   `[SHOT]` changes.
3. Once you have 5–20 good images of him, a trained character (Higgsfield
   Soul ID) holds the face and proportions steadier than prompts alone.
4. Generate finals at high quality and upscale before exporting icons:
   1024 px master → 512 / 192 / 180 px PNGs for `web/icon-*.png`.

The app's current animated mascot (`web/mr-cash.svg`) stays until you choose a
replacement; swapping it is a separate change.
