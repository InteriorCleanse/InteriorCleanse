/**
 * The coach without AI: answers from the journey, the what-to-look-for list,
 * the auction directory and the books (src/advisor.ts). It says plainly that
 * it is answering from Gavel's rules, so nobody mistakes it for research.
 */
import { JOURNEY, LOOK_FOR } from './journey.ts'
import type { StepStatus, TodayTask } from './journey.ts'
import { AUCTION_HOUSES, HOUSE_GROUPS } from '../sources/directory.ts'
import { answerFromBooks } from '../advisor.ts'
import type { Briefing, BriefingInput } from '../advisor.ts'

export type RulesContext = { status: StepStatus[]; today: TodayTask[]; books: BriefingInput; briefing: Briefing; stageName: string }

export function coachFromRules(q: string, c: RulesContext): string {
  const s = q.toLowerCase()
  const nextIdx = c.status.findIndex((x) => !x.done)
  if (/\b(look for|check|inspect|red flags?|what to watch|before i bid|checklist)\b/.test(s)) {
    return ['Before you bid on any auction car, go through this. A hard stop means walk away; there is always another car.', ...LOOK_FOR.map((g) => `${g.group}:\n${g.items.map((i) => `• ${i}`).join('\n')}`), 'Next step: open one car on your watchlist (#watch) and tick through this list with its photos and plan open.'].join('\n\n')
  }
  if (/\b(which auctions?|where (?:can|do|should) i buy|what auctions?|auction sites?|public auctions?)\b/.test(s)) {
    const open = HOUSE_GROUPS.filter((g) => g.id !== 'dealer' && g.id !== 'collector').map((g) => {
      const names = g.houses.map((id) => AUCTION_HOUSES.find((h) => h.id === id)).filter(Boolean).map((h) => `${h!.name}${h!.access === 'public' ? '' : h!.access === 'broker' ? ' (through a broker)' : h!.access === 'public-some-states' ? ' (public in some states)' : ' (dealer licence)'}`)
      return `${g.title}: ${names.join(', ')}.\n${g.bestFor}`
    })
    return ['Where a beginner can buy, best first:', ...open, 'Dealer-only auctions (Manheim, ADESA, ACV) need a dealer licence: later, not first.', 'Next step: open Auctions (#auctions) for each one\'s fees, how to register and a search link.'].join('\n\n')
  }
  if (/\b(first (?:auction )?car|walk me through|how do i (?:start|buy|begin)|where do i start|beginner|step by step)\b/.test(s)) {
    const lines = JOURNEY.map((j, i) => `${c.status[i].done ? '✓' : i === nextIdx ? '→' : '·'} ${j.n}. ${j.title}`)
    const next = nextIdx >= 0 ? JOURNEY[nextIdx] : undefined
    return [`Your first auction car, in twelve steps. You are at: ${c.stageName}.`, lines.join('\n'), next ? `Now: ${next.title}. ${next.why}\n${next.do.map((d) => `• ${d}`).join('\n')}\nOpen it: ${next.href}` : 'You have done every step. Now do it again, a little bigger, and keep the books true.'].join('\n\n')
  }
  if (/\b(today|plan my day|what should i do|next step|what now)\b/.test(s)) {
    return [`Today's three:`, c.today.map((t, i) => `${t.done ? '✓' : `${i + 1}.`} ${t.title}: ${t.why} (${t.href})`).join('\n'), c.briefing.items.length ? `Also on your desk: ${c.briefing.items[0].title}.` : ''].filter(Boolean).join('\n\n')
  }
  return answerFromBooks(q, c.books, c.briefing).answer
}
