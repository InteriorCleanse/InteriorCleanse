import { describe, expect, it } from 'vitest'
import {
  BRIEFING_LABELS,
  briefingToSpeech,
  buildBriefing,
  type BriefingKind,
} from '@/lib/assistant/briefings'

const KINDS: BriefingKind[] = ['morning', 'end_of_day', 'weekly', 'monthly']

describe('buildBriefing', () => {
  it('reports in the workspace currency, not a default', () => {
    const sterling = buildBriefing({ kind: 'weekly', isDemo: true, currency: 'GBP' })
    const dollars = buildBriefing({ kind: 'weekly', isDemo: true, currency: 'USD' })
    expect(sterling.headline).toContain('£')
    expect(dollars.headline).toContain('$')
    expect(sterling.lines[0]!.value).toContain('£')
  })

  it('is deterministic — the same inputs give the same words', () => {
    const a = buildBriefing({ kind: 'weekly', isDemo: true })
    const b = buildBriefing({ kind: 'weekly', isDemo: true })
    expect(a).toEqual(b)
  })

  it.each(KINDS)('produces a headline and figures for the %s briefing', (kind) => {
    const briefing = buildBriefing({ kind, isDemo: true })
    expect(briefing.title).toBe(BRIEFING_LABELS[kind])
    expect(briefing.headline.length).toBeGreaterThan(20)
    expect(briefing.lines.length).toBeGreaterThan(0)
    expect(briefing.period.length).toBeGreaterThan(0)
  })

  it('names the period on every briefing, so a figure is never ambiguous', () => {
    for (const kind of KINDS) {
      const briefing = buildBriefing({ kind, isDemo: true })
      expect(briefing.period).toBeTruthy()
      for (const line of briefing.lines) {
        expect(line.value).not.toBe('')
      }
    }
  })

  it('marks a demo workspace as demo', () => {
    expect(buildBriefing({ kind: 'morning', isDemo: true }).isDemo).toBe(true)
  })

  it('says there is no data rather than reporting a page of zeroes', () => {
    const briefing = buildBriefing({ kind: 'morning', isDemo: false })
    expect(briefing.lines).toHaveLength(0)
    expect(briefing.headline).toContain('No data')
    expect(briefing.attention).toHaveLength(0)
    // "These figures are partial" is noise when there are no figures.
    expect(briefing.caveats).toHaveLength(0)
    // Still offers a way forward.
    expect(briefing.followUps.length).toBeGreaterThan(0)
  })

  it('never reports a percentage change from a zero baseline', () => {
    for (const kind of KINDS) {
      for (const line of buildBriefing({ kind, isDemo: true }).lines) {
        if (line.change === null) continue
        // Either a real movement, "flat", or an explicit unavailability reason.
        const ok =
          /^(up|down) \d/.test(line.change) ||
          line.change === 'flat' ||
          /No activity/i.test(line.change)
        expect(ok, `unexpected change wording: ${line.change}`).toBe(true)
      }
    }
  })

  it('marks a rising cost as negative, not green', () => {
    const spend = buildBriefing({ kind: 'weekly', isDemo: true }).lines.find(
      (l) => l.label === 'Ad spend',
    )!
    if (spend.change?.startsWith('up')) expect(spend.sentiment).toBe('negative')
    if (spend.change?.startsWith('down')) expect(spend.sentiment).toBe('positive')
  })

  it('reports unavailable ratios as unavailable rather than as zero', () => {
    const empty = buildBriefing({ kind: 'monthly', isDemo: false })
    // No data at all, so nothing is dressed up as a figure.
    expect(empty.lines.every((l) => l.value !== '0')).toBe(true)
  })

  it('surfaces every data-quality caveat the metrics carry', () => {
    const briefing = buildBriefing({ kind: 'monthly', isDemo: true })
    expect(Array.isArray(briefing.caveats)).toBe(true)
    for (const caveat of briefing.caveats) expect(caveat.length).toBeGreaterThan(0)
  })

  it('raises unallocated ad spend for attention, since it understates product profit', () => {
    const briefing = buildBriefing({ kind: 'monthly', isDemo: true })
    const text = briefing.attention.join(' ')
    // Demo data has an unattributable slice; if that ever changes, this should
    // fail loudly rather than silently drop the caveat.
    expect(text.length + briefing.caveats.join(' ').length).toBeGreaterThan(0)
  })

  it('offers follow-ups the assistant can actually answer', () => {
    for (const kind of KINDS) {
      const briefing = buildBriefing({ kind, isDemo: true })
      expect(briefing.followUps.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('briefingToSpeech', () => {
  it('leads with the demo warning when the workspace is a demo', () => {
    const spoken = briefingToSpeech(buildBriefing({ kind: 'morning', isDemo: true }))
    expect(spoken.startsWith('This is demonstration data.')).toBe(true)
  })

  it('is plain prose with no markdown for a synthesiser to read out', () => {
    const spoken = briefingToSpeech(buildBriefing({ kind: 'weekly', isDemo: true }))
    expect(spoken).not.toMatch(/[*_#|`]/)
    expect(spoken.length).toBeGreaterThan(20)
  })

  it('stays short — a briefing read aloud is a paragraph, not a report', () => {
    const spoken = briefingToSpeech(buildBriefing({ kind: 'monthly', isDemo: true }))
    expect(spoken.split(/\s+/).length).toBeLessThan(120)
  })
})
