import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG AA contrast, computed from the real theme tokens.
 *
 * A contrast audit is usually a person with a picker and a spreadsheet, done
 * once, and wrong by the second redesign. The tokens are numbers in one CSS
 * file, and the ratio is arithmetic, so this is a test instead: it parses
 * `app/globals.css` for both themes and checks every text colour against every
 * surface it can land on. A token that drifts below the line fails the build.
 *
 * What is held to which standard, and why:
 *
 * **Text tokens: 4.5:1 (SC 1.4.3).** `ink`, `muted`, `signal`, `cobalt`,
 * `amber`, `positive` and `negative` are all used at body size — status lines,
 * links, deltas, warnings. None of them is reserved for large text, so none
 * gets the 3:1 large-text allowance. Checked against `ground`, `panel` and
 * `panel-raised`, because the raised panel is the darkest light-theme surface
 * and is where a colour fails first.
 *
 * **Series fills: documented exemption, not a check.** SC 1.4.11 requires 3:1
 * for graphical objects only where colour is the sole means of identifying
 * them. Every chart here carries direct labels and a keyboard-accessible table
 * equivalent — that is a product rule, asserted in the launch checklist and the
 * chart harness — so a series fill is never the only signal. The series hues
 * are also pinned by `tests/palette.test.ts` for colour-vision separation, and
 * darkening them to clear a bar they are exempt from would trade a real
 * accessibility property for a nominal one.
 *
 * **Hairlines: exempt.** Borders are decorative here; panels are distinguished
 * from the ground by their fill, which is checked below as a surface pair.
 *
 * The first run of this file found three light-theme failures — `signal` at
 * 3.5:1, `amber` at 3.6:1 and `muted` at 4.4:1 on the raised panel — which had
 * survived a visual inspection in both themes. The eye does not measure.
 */

type Rgb = [number, number, number]
type Theme = Record<string, Rgb>

const CSS = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8')

function tokensIn(block: string): Theme {
  const theme: Theme = {}
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    theme[match[1]!] = [Number(match[2]), Number(match[3]), Number(match[4])]
  }
  return theme
}

function extract(selector: RegExp): Theme {
  const match = CSS.match(selector)
  if (!match?.[1]) throw new Error(`Could not find theme block for ${selector}`)
  return tokensIn(match[1])
}

// Light is the bare :root block; dark is the explicit data-theme override,
// which the prefers-color-scheme block must mirror (asserted below).
const LIGHT = extract(/:root\s*\{([\s\S]*?)\n\}/)
const DARK = extract(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)
const DARK_SYSTEM = extract(/:root:not\(\[data-theme='light'\]\)\s*\{([\s\S]*?)\n\s*\}/)

/** Relative luminance per WCAG 2.x, sRGB. */
function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT_TOKENS = ['ink', 'muted', 'signal', 'cobalt', 'amber', 'positive', 'negative'] as const
const SURFACES = ['ground', 'panel', 'panel-raised'] as const
const AA_TEXT = 4.5

describe('the contrast arithmetic', () => {
  it('agrees with the WCAG reference values', () => {
    // Black on white is the canonical 21:1; a mid grey on white is the
    // canonical 4.5:1 boundary case (#767676).
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeGreaterThanOrEqual(4.5)
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeLessThan(4.55)
  })

  it('is symmetric', () => {
    expect(contrast([10, 20, 30], [200, 210, 220])).toBe(contrast([200, 210, 220], [10, 20, 30]))
  })
})

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme', (_name, theme) => {
  it('defines every token the checks depend on', () => {
    for (const token of [...TEXT_TOKENS, ...SURFACES]) {
      expect(theme[token], `${token} is missing`).toBeDefined()
    }
  })

  describe.each(TEXT_TOKENS)('%s as text', (token) => {
    it.each(SURFACES)('reaches AA 4.5:1 on %s', (surface) => {
      const ratio = contrast(theme[token]!, theme[surface]!)
      expect(
        ratio,
        `${token} on ${surface} is ${ratio.toFixed(2)}:1; AA for body text is ${AA_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_TEXT)
    })
  })

  it('separates a panel from the ground it sits on', () => {
    // Borders are exempt as decoration, so the fill has to do the work of
    // showing where a panel begins. Not a WCAG number — merely "not equal".
    expect(theme.panel).not.toEqual(theme.ground)
    expect(theme['panel-raised']).not.toEqual(theme.panel)
  })
})

describe('the two dark blocks', () => {
  it('agree, so the toggle and the system preference render the same theme', () => {
    // A token defined in one dark block and not the other renders differently
    // depending on how the viewer arrived at dark mode. The first run of this
    // test found exactly that: the series slots existed only in the
    // system-preference block, so an explicit toggle drew charts in the
    // light-tuned hues on a dark ground.
    const tokens = new Set([...Object.keys(DARK), ...Object.keys(DARK_SYSTEM)])
    for (const token of tokens) {
      expect(DARK[token], `${token} differs between dark blocks`).toEqual(DARK_SYSTEM[token])
    }
  })

  it('give chart fills at least 3:1 on the dark panel, the signature theme', () => {
    // Stronger than the exemption requires. Dark is the experience most people
    // will live in, and its series hues clear SC 1.4.11 outright, so the
    // exemption is only ever leaned on in the light theme.
    for (const slot of ['series-1', 'series-2', 'series-3', 'series-4']) {
      const ratio = contrast(DARK[slot]!, DARK.panel!)
      expect(ratio, `${slot} on dark panel is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    }
  })
})
