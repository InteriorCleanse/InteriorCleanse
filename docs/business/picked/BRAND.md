# Picked brand system

## The idea in one line

**Real fruit. Real protein.** Picked tastes like the fruit on the label because
the fruit on the label is in it, and the pack says how much.

## Positioning

| | |
| --- | --- |
| For | Active adults who drink protein most days and are tired of milkshake flavors or candy-flavored "fruit" |
| Picked is | a light, juice-style whey protein drink |
| That | tastes like actual strawberries, mango, or raspberry and lemon |
| Because | real fruit is the main flavor ingredient, stated in grams on every pack |
| Unlike | clear wheys flavored with "natural and artificial flavors" and sucralose |

**The proof point we own:** grams of real fruit per scoop, printed on the front.
Nobody in the category does this. Myprotein already says "real fruit flavors",
so the word "real" alone is not enough. The gram number is the moat.

**A cloudy drink is fine.** Fruit solids make the drink slightly cloudy. Do not
fight it. *It looks like juice because there's fruit in it.*

## Voice

Three words: **bright, honest, refreshing.**

- Talk like a friend at a farmers' market, not a coach in a gym.
- Be sensory and specific: "tart", "sun-warm", "the seedy bit of a strawberry".
- Short sentences. Lowercase is fine in headlines and on pack.
- Dry humor about fake fruit is allowed. Sneering at customers is not.

| Say | Never say |
| --- | --- |
| made with real strawberries | gains, shred, beast, anabolic |
| 20g protein, mix with cold water | guilt-free, cheat, skinny, detox, cleanse |
| [x]g of fruit in every scoop | "superfood", "clinically proven" (unless it is) |
| no sucralose, no fake fruit | any disease, weight-loss, or GLP-1 treatment claim |
| tastes like it was just picked | "the best protein ever", invented reviews or ratings |

Headline examples:

- *Protein that tastes like it was just picked.*
- *Strawberry, from strawberries.*
- *Your shaker has been lying to you about mango.*
- *It looks like juice because there's fruit in it.*

## Logo

| File | Use |
| --- | --- |
| `brand/picked-wordmark.svg` | Primary. Ink wordmark, leaf-green leaf, on cream or light fruit colors. |
| `brand/picked-wordmark-reverse.svg` | Cream wordmark, sprout leaf, on deep leaf or raspberry. |
| `brand/picked-wordmark-onfruit.svg` | One-color ink, for strawberry, mango, lemon, and single-color print. |
| `brand/picked-mark.svg` | The leaf alone in a strawberry disc. Social avatar, stickers, scoop. |
| `brand/favicon.svg` | Browser tab and app icon. |

The wordmark is Bricolage Grotesque ExtraBold, converted to outlines, with the
dot of the "i" replaced by a leaf. The leaf has a hairline midrib cut so it
works in one color. Clear space equals the height of the "e" on all sides.
Minimum width is 72 px on screen and 18 mm in print. Never set the name in
another font, never add a second leaf, and never put the leaf on the "k".

## Color

Each flavor owns a color. The brand neutrals hold everything together.

| Token | Hex | Role |
| --- | --- | --- |
| Ink | `#1E1A17` | Text, wordmark |
| Cream | `#FFF7EC` | Page ground |
| Leaf | `#2F7D3A` | The leaf, links on cream (4.8:1) |
| Deep leaf | `#1F4D2C` | Dark sections, reverse logo ground |
| Sprout | `#9BD36A` | Leaf on dark grounds |
| Strawberry | `#F0505E` | Strawberry pouch, accent (ink on it 4.95:1) |
| Strawberry deep | `#C81E3A` | Strawberry as text or button on cream (5.3:1) |
| Mango | `#FFB01F` | Mango pouch (ink on it 9.4:1) |
| Raspberry | `#B8185A` | Raspberry Lemon pouch (cream on it 6.0:1) |
| Lemon | `#F6DD3D` | Highlights and the lemon slice (ink on it 12.6:1) |

Pairings that pass 4.5:1 for small text: ink on cream, strawberry, mango, or
lemon; cream on raspberry, deep leaf, or ink. Never put cream on mango or
strawberry, and never put ink on raspberry.

## Type

| Role | Face | Notes |
| --- | --- | --- |
| Display | Bricolage Grotesque, 800 | Flavor names, headlines. Tight tracking (about -3%). |
| Body and label | Libre Franklin, 500 and 700 | Copy, Supplement Facts, small caps labels with 0.15em tracking. |

Both are free on Google Fonts under the Open Font License.

## Packaging

Concepts: `brand/pouch-strawberry.svg`, `brand/pouch-mango.svg`,
`brand/pouch-raspberry-lemon.svg`. All text is outlined, so they open in
Illustrator or Figma without fonts.

Front panel, top to bottom:

1. Wordmark.
2. Category line: REAL FRUIT PROTEIN DRINK MIX.
3. Flavor name, as big as it fits.
4. "made with real [fruit]". Replace with "[x]g real [fruit] in every scoop"
   once the formula is final.
5. 20g protein badge. Use the number from the final Supplement Facts, not this concept.
6. "mix with cold water. no sucralose. no fake fruit."
7. Statement of identity and net quantity band. "Dietary Supplement" and
   "NET WT [TBD]" are placeholders until the regulatory route and fill weight
   are fixed.

Back panel: Supplement Facts, ingredients in descending order, "Contains:
Milk", directions, lot and best-by, manufacturer or distributor address, QR
code to that lot's certificate of analysis, and any Prop 65 warning the test
results require. A food lawyer or label consultant reviews it before print.

These are design concepts, not print files. The printer's dieline sets the
final size, the bleed, the zipper, and the tear notch.

## Photography and imagery

- Real fruit, real light, real hands. Cut fruit next to the glass.
- The drink photographed against a window so its color reads like juice.
- No stock photos of the product, and no AI-generated product photos until a
  real pouch exists to reference.
- No shirtless gym shots. The setting is a kitchen counter, a park, a car after a run.

## Packaging system

| File | What it is |
| --- | --- |
| `brand/pouch-back-strawberry.svg` | Back panel template: story, Supplement Facts layout, other ingredients, Contains: Milk, directions, lot QR slot, UPC slot, distributor line |
| `brand/stick-*.svg` | Single-serve stick packs, one per flavor |
| `brand/counter-display.svg` | Counter box for 10 sticks with header card, for gyms, studios, and cafés |
| `brand/shaker.svg` | Branded shaker with volume marks |

Every value in brackets on the back panel is a placeholder. The Supplement
Facts layout shows structure only; the manufacturer and a label consultant
fill it in from the final formula.

## Design tokens

`brand/tokens/design-tokens.json` holds the system in three layers: primitive
values, semantic roles, and component settings. `brand/tokens/tokens.css` is
the same as CSS variables, with `[data-flavor]` switching the active flavor.
Contrast ratios are recorded next to each pairing.

## Exports

- `brand/png/`: wordmark and reverse wordmark at 512, 1024, and 3000 px wide,
  and the mark at 512 and 1024, all with transparent backgrounds.
- `brand/social/`: five editable Instagram templates (HTML) with PNG exports:
  a Strawberry post, a flavor vote, a label comparison, the first Real Fruit
  Test carousel slide, and a waitlist story.
- `brand/mood/MOOD.md`: six AI-generated mood photos of fruit and drinks,
  with links and the prompt recipe for more.

## Spelling

Customer-facing copy (pack, site, social, email) uses US spelling: flavor,
color. Internal planning documents may differ.

## Rebuilding the art

`brand/src/` holds the scripts that drew the wordmark and pouches from the
font outlines. They need `pip install fonttools` and the two font files from
Google Fonts saved next to them as `brico800.ttf`, `franklin500.ttf`, and
`franklin700.ttf`.
