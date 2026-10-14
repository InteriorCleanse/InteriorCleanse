# Picked site design system

A locked design system for Picked's website and anything built on it. Every
page reads this file before emitting code. Extend or amend it; don't
regenerate it per page. The brand reasoning is in `BRAND_THEME.md`.

## Genre
Editorial with a playful register (custom, tuned). A fruit stand, set in type.

## Macrostructure family
- Marketing pages (home): Marquee Hero, fruit-stand variant. The hero is the
  fruit's color field with the pack; sections alternate cream, paper, fruit,
  and crown green.
- Content pages (Real Fruit Test, Lot Book, privacy, thanks): Long Document
  on cream, typography only, the crown header and statement footer.
- Utility (links): single centered column.

## Theme (hex is canonical; these are the brand's print colors)
- `--c-cream` #FFF7EC (paper) · `--c-paper-2` #F6EADB (paper elevation)
- `--c-ink` #1E1A17 (text)
- `--c-deep` #1F4D2C (crown green) · `--c-sprout` #9BD36A (leaf on green)
- Fruit fields, one per flavor: strawberry #F0505E, mango #FFB01F, raspberry #B8185A
- Text-safe accent on cream, one per flavor: strawberry-deep #C81E3A, mango-deep #B4380F, raspberry #B8185A
- Focus: ink on light grounds, cream on green and raspberry

**Brand amendment to the accent rule:** the fruit color fields are the
product, not UI accent, so they may fill a hero or a closer. UI accent (links,
active states, numerals) stays one text-safe color at a time.

## Typography
- Display: Bricolage Grotesque 800, roman only, tracking -0.035em to -0.045em
- Body: Libre Franklin 400/500/700
- No third family. The wordmark is outlined artwork, not type.
- Display scale: `--text-display` clamp(3.2rem, 9.2vw, 7.6rem); `--text-display-s` clamp(2.4rem, 6vw, 4.6rem); `--text-h2` clamp(2rem, 4.6vw, 3.6rem)

## Spacing
4-point named scale in `site/assets/site.css` (`--space-2xs` to `--space-3xl`).

## Motion
- Easing `--ease-out` cubic-bezier(.16, 1, .3, 1). Short 180ms, medium 360ms.
- One motion only: the flavor swap (fruit and sticker cross-fade, fruit fields recolor).
- Reduced motion: opacity only, 120ms.

## Microinteractions stance
- Silent success: forms go straight to the thanks page.
- Errors are specific and say how to fix them.
- No toasts, no confetti, no autoplay.

## CTA voice
- Primary: ink pill, cream text, "Get in line". One per section.
- On crown green: cream pill, ink text.
- Secondary: outline pill.

## Signature elements (every page shares)
- The crown header: deep green with a leaf-tip lower edge.
- The statement footer: "The fruit is in it." with "in it." in sprout.
- The fruit sticker appears at most once per view.

## Per-page allowances
- Home may use the pouch, the cut fruit, the sticker, and the lineup.
- Content pages: typography only, plus the sticker on thanks.
- No photography until real product photos exist.

## Exports

### tokens.css
See the `:root` block at the top of `site/assets/site.css`; it is the token
file for this project.
