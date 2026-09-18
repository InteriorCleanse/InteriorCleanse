/**
 * THE VOICE — how Mr. Cash talks.
 *
 * Laid-back, warm, unhurried. The register of someone who has been doing this a
 * long time, is in no rush at all, and would rather wait for the right wave than
 * paddle for a bad one. Plain words, short sentences, no jargon unless the
 * number needs it.
 *
 * THE RULE THAT MATTERS MORE THAN THE VIBE
 *
 * The voice is allowed to change HOW something is said. It is never allowed to
 * change WHAT is being said. It cannot add confidence, imply a profit, promise
 * an outcome, or soften a warning into something friendlier than the facts. A
 * relaxed voice that oversells is worse than a robotic one that doesn't —
 * "chill" must never become "it's fine".
 *
 * So every line here is built from facts passed in, the numbers are printed
 * verbatim, and `test/voice/persona.test.ts` holds a banned-vocabulary guard
 * that fails if hype ever creeps in.
 *
 * Phrasing is DETERMINISTIC: the same state always produces the same words,
 * picked by a content hash. A dashboard that reworded itself every few seconds
 * would be exhausting to read and impossible to test.
 */

/** Pick a stable variant from a list, keyed by content rather than chance. */
function pick<T>(options: readonly T[], key: string): T {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return options[Math.abs(h) % options.length]
}

// ---------------------------------------------------------------
// How he sounds out loud
// ---------------------------------------------------------------

/**
 * Speech settings for the browser's synthesiser. Slower and a touch brighter
 * than the default — an unhurried voice, not a newsreader.
 *
 * The voice preference order is a hint, not a guarantee: which voices exist
 * depends entirely on the listener's operating system, so this degrades to
 * whatever English voice is available rather than failing.
 */
export const SPEECH = {
  /** Unhurried. The default 1.0 sounds like a man reading a disclaimer. */
  rate: 0.86,
  /** Slightly up, which reads as warm rather than grave. */
  pitch: 1.06,
  /** Preferred voices, best first. Relaxed and warm ahead of clipped and formal. */
  preferred: ['Karen', 'Lee', 'Daniel', 'Alex', 'Google UK English Male', 'Samantha', 'Aaron'],
  /** Language preference, best first: Australian, then UK, then anything English. */
  languages: ['en-AU', 'en-GB', 'en-US', 'en'],
} as const

// ---------------------------------------------------------------
// The lines
// ---------------------------------------------------------------

export type FloorFacts = {
  verdict: string
  verdictDetail: string
  trust: number
  blind: string[]
  evidence: string
  gatesMet: number
  gatesTotal: number
  paperTrades: number
  symbol: string
}

/**
 * The one line at the top of the desk: what is going on, in plain English.
 *
 * Deliberately leads with the honest state rather than the exciting one. When
 * nothing is happening it says so warmly instead of manufacturing drama, because
 * most of the time nothing IS happening, and a desk that invents urgency to stay
 * interesting is training the wrong instinct.
 */
export function floorLine(f: FloorFacts): string {
  const key = `${f.verdict}|${f.trust}|${f.blind.join(',')}`

  if (f.verdict === 'VETOED') {
    return pick([
      `Held that one back. ${f.verdictDetail}`,
      `Nope, sat that one out. ${f.verdictDetail}`,
    ], key)
  }
  if (f.verdict === 'LONG' || f.verdict === 'SHORT') {
    const side = f.verdict === 'LONG' ? 'long' : 'short'
    return pick([
      `Alright — a ${side} setup cleared every safety check. ${f.verdictDetail}`,
      `We've got one. A ${side} made it through the whole checklist. ${f.verdictDetail}`,
    ], key)
  }
  if (f.verdict.includes('UNCHECKED')) {
    return `There's a setup on the board, but it hasn't been through the safety checks yet, so I'm not calling it anything.`
  }
  // The common case, by a mile: nothing to do.
  return pick([
    `Nothing worth riding yet on ${f.symbol}. ${f.verdictDetail}`,
    `Just floating here on ${f.symbol} — nothing's lined up. ${f.verdictDetail}`,
    `Quiet one so far on ${f.symbol}. ${f.verdictDetail}`,
  ], key)
}

/** The plain-English gloss on the trust number, which is easy to misread. */
export function trustLine(trust: number, blind: string[]): string {
  if (blind.length === 0) return `Every panel's reading something right now. That's about how much I can see — not how sure I am about any trade.`
  const names = blind.join(' and ')
  if (trust >= 60) return `Most of the desk is reading fine, but ${names} can't see anything at the moment. I'd rather tell you than paper over it.`
  return `Fair bit of the desk is dark right now — ${names} ${blind.length === 1 ? 'is' : 'are'} not seeing anything. Take everything else here with that in mind.`
}

/** The plain-English gloss on the evidence line. This one is never softened. */
export function evidenceLine(f: Pick<FloorFacts, 'evidence' | 'gatesMet' | 'gatesTotal' | 'paperTrades'>): string {
  if (f.evidence === 'GATES MET') {
    return `All ${f.gatesTotal} checks are met across ${f.paperTrades} paper trades. That's the validation stage passed — it is not proof of an edge, and it is not real money.`
  }
  if (f.paperTrades === 0) {
    return `No paper trades on the board yet, so there's nothing here that counts as evidence. ${f.gatesMet} of ${f.gatesTotal} checks met.`
  }
  return `${f.gatesMet} of ${f.gatesTotal} checks met on ${f.paperTrades} paper trade${f.paperTrades === 1 ? '' : 's'}. Not enough to call anything yet.`
}

export type AgentFacts = {
  id: string
  status: 'LIVE' | 'PARTIAL' | 'BLIND' | 'WAITING'
  headline: string
  waitingOn: string | null
}

/** One warm sentence per panel, so a person can skim the desk without decoding it. */
export function agentLine(a: AgentFacts): string {
  const key = `${a.id}|${a.status}`
  if (a.status === 'BLIND') {
    return a.waitingOn
      ? `Can't see this one right now — waiting on ${a.waitingOn}. Not going to guess.`
      : `Can't see this one right now, and I'm not going to guess at it.`
  }
  if (a.status === 'WAITING') {
    return a.waitingOn ? `All good here, just waiting on ${a.waitingOn}.` : `All good here, nothing to do yet.`
  }
  if (a.status === 'PARTIAL') {
    return `Reading this one, but it's an estimate rather than the real thing — worth knowing.`
  }
  return pick([`Reading this one clean.`, `This one's looking sharp.`], key)
}

/** Friendly names, so the desk reads as English instead of a control panel. */
export const AGENT_NAMES: Record<string, { title: string; plain: string }> = {
  book: { title: 'Order flow', plain: 'Who\'s actually buying and selling right now' },
  tape: { title: 'Structure', plain: 'The shape of the chart — levels, gaps, sweeps' },
  signal: { title: 'The setup', plain: 'What the strategies think, all in one number' },
  risk: { title: 'Safety checks', plain: 'The rules that can stop a trade before it starts' },
  regime: { title: 'Market mood', plain: 'Trending, ranging, or somewhere in between' },
  proof: { title: 'Track record', plain: 'How much any of this has actually earned' },
}

/** What he'd say out loud if you asked for the whole desk in one breath. */
export function spokenDesk(f: FloorFacts): string {
  return [floorLine(f), trustLine(f.trust, f.blind), evidenceLine(f)].join(' ')
}
