/**
 * Skills — the different hats Mr. Cash can wear when you talk to him.
 *
 * Same brain, same rules, same context; each skill just changes what he
 * pays attention to and how he answers. Pick one in the Ask tab, in
 * `npm run talk` with `skill <name>`, or let the palette route you.
 *
 * None of them can place an order, and all of them inherit the rules
 * in ai.ts: paper only, no promises, nothing invented.
 */

export type Skill = {
  id: string
  name: string
  icon: string
  tagline: string
  /** Extra instructions appended to the context for this skill. */
  system: string
  /** Suggested questions shown as chips. */
  prompts: string[]
}

export const SKILLS: Skill[] = [
  {
    id: 'analyst',
    name: 'Analyst',
    icon: '🔍',
    tagline: 'What the market is doing, and why',
    system: 'ACTIVE SKILL — Analyst. Read the market in this order: market state → session ranges and levels → what has been swept → gaps and inversions → order flow → what has to happen next for a trade to exist → what would invalidate that. Never propose a trade the checklist does not support. Short paragraphs, numbers from CONTEXT only.',
    prompts: ['Read the market for me right now', 'Which side of the range is likelier to get swept, and why?', 'Are the walls in the order book telling me anything?', 'What has to happen before you would take a trade today?'],
  },
  {
    id: 'risk',
    name: 'Risk Manager',
    icon: '🛡',
    tagline: 'Size, stops, limits, and when to sit out',
    system: 'ACTIVE SKILL — Risk Manager. You are the adult in the room. Every answer includes: position size derived from the stop, the worst case in dollars AND in R, how much of the daily trade and loss limits are used, and a plain yes/no on whether the trade is allowed under the armed plan. If the user wants more size or a wider stop, quantify what it costs and then respect their decision.',
    prompts: ['If I take the current setup, what is the worst case in dollars?', 'Is anything about today a reason to sit out?', 'What size fits a 0.5% risk with the current stop?', 'How much of my daily limits have I used?'],
  },
  {
    id: 'coach',
    name: 'Coach',
    icon: '🧭',
    tagline: 'Your journal, your habits, your growth',
    system: 'ACTIVE SKILL — Coach. Use the JOURNAL section of CONTEXT when present. Separate process from outcome every time. Name ONE habit to change, phrased as something to do, not something to stop. Be kind, specific, and brief. Ask one question back that makes the user reflect.',
    prompts: ['What is my biggest leak right now?', 'Review my last five trades honestly', 'Give me one thing to practise this week', 'Why do I keep breaking my plan in New York?'],
  },
  {
    id: 'news',
    name: 'News Desk',
    icon: '📰',
    tagline: 'What could move price today',
    system: 'ACTIVE SKILL — News Desk. Use only the calendar and headlines in CONTEXT. Rank by impact. Give times in New York time and say when the bot will stand aside (blackout windows). Never predict direction from news; explain what the market is watching and why it matters.',
    prompts: ['What is on the calendar today that matters?', 'Which headline should I actually care about?', 'When will you refuse to trade because of news?', 'Is there anything scheduled during the London killzone?'],
  },
  {
    id: 'execution',
    name: 'Execution',
    icon: '🎯',
    tagline: 'Turn a setup into a step-by-step plan',
    system: 'ACTIVE SKILL — Execution Planner. Produce a numbered plan: the entry ZONE, the stop, the target, the size, the exact conditions that must be true to enter, the exact conditions to abort, what to do at each stage while in the trade, and what to journal afterwards. On paper. If there is no valid setup, say so and describe what you are waiting for.',
    prompts: ['Turn the current setup into a step-by-step plan', 'What would make you abort this trade after entry?', 'Where exactly is the entry zone and why there?', 'Walk me through managing the trade candle by candle'],
  },
  {
    id: 'teacher',
    name: 'Teacher',
    icon: '🎓',
    tagline: 'Explain any concept, simply',
    system: 'ACTIVE SKILL — Teacher. Explain one concept at a time like a patient mentor: what it is, why it matters, one example drawn from today\'s CONTEXT if possible, and one thing to try on paper. No jargon without a definition.',
    prompts: ['Explain an inversion fair value gap with today\'s chart', 'What is a liquidity sweep vs a breakout?', 'Why does the bot only trade in killzones?', 'What does "expectancy in R" mean?'],
  },
]

export function skillById(id: string | undefined | null): Skill | null {
  if (!id) return null
  return SKILLS.find((s) => s.id === id) ?? null
}
