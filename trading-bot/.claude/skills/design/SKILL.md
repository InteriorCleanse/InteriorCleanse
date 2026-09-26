---
name: design
description: Cinematic luxury design for Mr. Cash or any web page, with Higgsfield media (Seedance 2.0 video, GPT Image stills). Premium typography, one gold accent, smooth motion, ambient video. Use when the user types /design, asks to make something look more luxury, premium, modern or cinematic, or asks for Higgsfield or Seedance visuals.
---

# /design — cinematic luxury, made to last

This is the owner's "luxury watch brand" prompt turned into a method: a
cinematic, high-end visual experience with smooth scrolling, premium
typography, subtle animation and real video, made with Higgsfield. It is
applied to the app itself; it does not build a separate website.

## 1. Direction before pixels

Settle four things first and write them down:

1. **Feeling.** For Mr. Cash that is a private bank at night: calm, expensive and quiet.
2. **One accent.** Champagne gold `#D8B56E`, with the gradient `--gold-grad`.
3. **Two faces.**
   - Instrument Serif for display headlines only.
   - Instrument Sans for everything else.
   - Numbers are tabular.
4. **Meaning colours.** These are never decoration:
   - emerald for up
   - garnet for down
   - copper for waiting
   - jade for reading live

The tokens live in the MAISON layer at the end of `web/css/app.css`. Change
tokens, not individual rules.

## 2. Media with Higgsfield

Use the Higgsfield MCP tools.

1. **Poster still.** Use `generate_image`, model `gpt_image_2_5`, at 16:9.
   - Describe the subject, the materials and the light.
   - Leave dark negative space where the interface sits.
   - No text, logos or people.
2. **Loop.** Use `generate_video`, model `seedance_2_0`, at 16:9, 8 s, 1080p, with `generate_audio: false`.
   - Pass the still as both `start_image` and `end_image`, so the last frame matches the first and the video loops without a seam.
   - Keep the camera locked, with slow motion only.
3. **Presets.** If Higgsfield suggests a preset and the user asked for Seedance, retry with `declined_preset_id`.
4. **Cost.** Check it first with `get_cost: true`. A 1080p 8 s Seedance clip was 72 credits in September 2026.
5. **Install.** Save the files as `web/media/hero.mp4` (keep it under about 8 MB) and `web/media/hero.jpg`.
   - The app finds them through `/api/config` → `media` and plays the film behind everything: muted, looped, dimmed and vignetted.
   - It pauses the film when the tab is hidden, and shows only the poster for reduced motion.
   - Without the files it falls back to the drawn gold light.
6. **If you cannot download the files.** Some sandboxes block Higgsfield's CDN; the network policy decides. Do not route around the block. Give the user the job ids and ask them to save the files from their Higgsfield library.

## 3. Rules that do not bend

- **Security.**
  - The CSP stays as it is: no inline scripts, no remote fonts, no remote media.
  - Everything is served from `web/`.
- **Labels.** Honesty labels stay visible on every surface: PAPER, BACKTEST, MOCK, OVERRIDE, NOT ENOUGH DATA.
  - Design never hides or shrinks them.
  - No profitability language in any copy.
- **Motion.**
  - Motion follows `motion-design`: one signature curve, three durations, `prefers-reduced-motion` honoured.
  - Nothing animates off-screen.
- **Contrast.** Body text stays at 4.5:1 or better on its surface.
  - Gold on onyx passes.
  - Gold on ivory does not.
- **Scope.** Change the look, never the logic. Design work does not touch strategies, risk, fusion, `config.ts` or any execution path.

## 4. Craft checklist

- Headlines are in the serif, balanced (`text-wrap:balance`), with generous line height.
- Surfaces are warm glass: a faint top light, a gold hairline, and a tinted, never grey, shadow.
- There is one gold pill per view for the main action; everything else is smoked glass.
- Focus rings are gold and always visible.
- Check at 1280 px and 400 px, with no console errors, and take screenshots of Home, Scanner and one data-heavy tab.

## Related skills here

- `high-end-visual-design`, `design-taste-frontend` and `redesign-existing-projects`: audit, then upgrade.
- `motion-design`: timing and easing.
- `design-dna`: turn a reference image into tokens.
- `theme-factory`: alternative palettes.
