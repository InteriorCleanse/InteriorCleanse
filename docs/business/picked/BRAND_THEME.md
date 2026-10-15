# The Picked theme: the produce aisle, not the supplement aisle

Every protein and wellness brand looks like one of three things. Picked looks
like none of them. It looks like fresh fruit: the sticker on a strawberry, the
green top of the berry, the fruit cut open so you can see inside.

## What the category looks like now

| Lane | Who | How it looks | What it signals |
| --- | --- | --- | --- |
| **Hype** | Ghost, C4, RYSE | Black or loud packs, the logo dominating the front, candy and cereal collabs, sticker-bomb graphics | Gym, flavor-as-candy, fandom |
| **Pastel wellness** | Bloom, Alani Nu, Isopure Clear | Pastel or jewel tones, curvy custom logos, flat flavor illustrations, soft rounded type | Approachable wellness, Instagram-ready |
| **Clinical lab** | Transparent Labs, Momentous, Thorne | White and grey, the active ingredient numbers set biggest, minimal type | Proof, purity, "we have nothing to hide" |

What the research says about where those lanes are going:

- Bloom's identity (by the agency Riser) is a custom curvy logotype, cleaned-up
  hierarchy, and flat, colorful ingredient illustrations per flavor, built to
  feel approachable to women intimidated by gym-bro supplements
  ([Riser](https://riser.design/project/bloom/),
  [World Brand Design Society](https://worldbranddesign.com/bloom-branding-and-packaging-redesign/)).
- Alani Nu took the same pastel, bubble-font route into energy drinks
  ([Allen Adamson](https://allenadamson.com/alani-nu-lawsuit-brand-strategy-evidence/)).
- Packaging writers in 2026 say the pastel DTC look is now so common it reads
  as generic, not premium, and that the lab-logbook look, the active number
  set biggest, is the rising alternative
  ([Premium Label and Packaging](https://premiumlabelandpackaging.com/2026-packaging-trends-wellness/)).
- Ghost's packs keep its logo dominant and use faux sticker-bomb graphics on
  its cereal collabs ([Dieline](https://thedieline.com/ghost-and-general-mills-announce-new-protein-packed-breakfast-cereal/)).
- The food brands that broke out of tired categories did it by borrowing a
  different category's codes: Graza put olive oil in a squeeze bottle with
  primary colors; Fishwife made tinned fish look like art; Olipop made soda
  nostalgic ([Packaging Digest](https://www.packagingdigest.com/packaging-design/stand-out-in-beverage-packaging-design),
  [Artworkflow](https://www.artworkflowhq.com/resources/olipop-vs-poppi-the-ultimate-packaging-showdown)).

## Picked's lane

Nobody in protein looks like fresh fruit. Picked borrows the codes of the
produce aisle, and takes the one good idea from the lab lane: the most
important number is the biggest thing on the pack. For Picked, that number is
the grams of real fruit.

| Picked borrows | From | Why it's ownable |
| --- | --- | --- |
| **The fruit sticker** | The oval label on every piece of supermarket fruit | Everyone knows it; no protein brand uses it; it carries the proof (grams and lot) |
| **The green crown** | The leafy top of a strawberry, the stem of a mango | It turns every pouch into its fruit; a shelf of Picked reads as a fruit stand |
| **Cut-open fruit** | Fruit sliced to show the inside | The brand's whole idea is showing what's inside; competitors draw whole fruit or candy |
| **The lot pill** | Batch codes and produce PLU numbers | It's the key to the Lot Book: the label points to the lab results |
| **Ripe color** | Real fruit, at full ripeness | Not pastel (Bloom), not neon (Ghost), not grey (lab) |

**The cover-the-logo test:** hide the wordmark and a Picked pouch is still
Picked. The sticker, the crown and the cut fruit do the work.

**What a competitor would have to do to copy it:** print its own fruit grams
and publish its own lab results. That's the point.

## The system

| Element | Spec |
| --- | --- |
| **Crown green** | Deep leaf `#1F4D2C`. Every pack top, the site header, the footer. The brand's own color. |
| **Fruit colors** | Strawberry `#F0505E`, Mango `#FFB01F`, Raspberry `#B8185A`, Lemon `#F6DD3D`. One fruit owns one color. |
| **Paper** | Cream `#FFF7EC`. Ink `#1E1A17`. Sprout `#9BD36A` only on green. |
| **Type** | Bricolage Grotesque 800 for the name, the flavor and the fruit number. Libre Franklin for everything else. |
| **The wordmark** | The leaf sprouts from the i on a short stalk, 18 degrees off vertical, always green. |
| **The mark** | A cream "p" sprouting the same leaf, on crown green. Avatar and app icon. |
| **The sticker** | Cream oval, ink keyline, a flavor-color ring, the grams set biggest, "REAL [FRUIT] / IN EVERY SCOOP", a LOT pill. Tilted about 8 degrees when placed. |
| **The crown edge** | A row of leaf tips hanging down. Packs, the site header, banners. |
| **Cut fruit** | Strawberry halved, mango halved to its flat stone, raspberry with a lemon wheel. Flat, bold, no gradients. |
| **Master line** | "The fruit is in it." Closes every ad, the back panel, and the site. |
| **Flavor lockup** | "Strawberry, from strawberries." The flavor big, the source under it. |
| **The seal** | On the mailer, one fruit sticker across the lid edge seals the box. Opening it means breaking the sticker (`brand/unboxing/`). |
| **The sting** | 3.6 seconds: crown drops, leaf sprouts, fruit pops, sticker slaps, line lands. Ends every video (`brand/motion/`). |

Source files: `brand/src/` (`wordmark.py`, `mark.py`, `device.py`, `pack.py`,
`packaging2.py`, `unboxing.py`, `sting.py`). The website follows `design.md`.

## Rules that keep it

1. **The fruit number outranks the protein number.** Everywhere.
2. **One sticker per surface.** It's the signature; repeating it makes it wallpaper.
3. **The leaf is always green.** Never ink on fruit, except true one-color print.
4. **No pastel washes, no neon, no gradients** across a whole surface. Ripe, flat color.
5. **Never draw a pouch that doesn't exist as if it were real.** Concept art is
   labeled as concept art until a real pouch is photographed.
6. **The grams stay `[x]g` or `?g` until the formula is final.** The blank
   sticker is a feature: "We print it when it's real."
7. **Before print:** the trademark attorney clears PICKED (`NAME.md`), and the
   label consultant reviews every word on the pack.
