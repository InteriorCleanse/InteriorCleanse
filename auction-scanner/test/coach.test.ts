/** The coach: the journey, today's three, the streak, the offline answers and the agent loop. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JOURNEY, LOOK_FOR, journeyStatus, stageOf, todayTasks } from '../src/coach/journey.ts'
import type { JourneyFacts } from '../src/coach/journey.ts'
import { carryOver, currentThread, newThread, readCoach, streak, writeCoach, MAX_TURNS } from '../src/coach/store.ts'
import { coachTurn } from '../src/coach/agent.ts'
import type { CoachClient, CoachMsg, CoachTool } from '../src/coach/agent.ts'
import { coachFromRules } from '../src/coach/rules.ts'
import { withUser } from '../src/store.ts'

const fresh: JourneyFacts = { onboarded: false, guidesRead: [], watched: 0, watchedSources: 0, imports: 0, paperBids: 0, paperDecided: 0, carsOwned: 0, carsWithCosts: 0, materialsTicked: 0, soldOrRented: 0 }
const DAY = 86_400_000
const T = Date.UTC(2026, 9, 4, 15)

test('the journey: twelve steps, done only by what Gavel can see or what the member ticks', () => {
  assert.equal(JOURNEY.length, 12)
  assert.ok(LOOK_FOR.some((g) => g.items.some((i) => /VIN/.test(i))))
  let st = journeyStatus(fresh, [])
  assert.equal(st.filter((s) => s.done).length, 0)
  assert.equal(stageOf(st).name, 'Getting set up')
  st = journeyStatus({ ...fresh, onboarded: true, cashUsd: 5000, homeState: 'TX', guidesRead: ['first-car'], watched: 3, watchedSources: 2 }, ['where'])
  assert.deepEqual(st.slice(0, 4).map((s) => s.by), ['gavel', 'you', 'gavel', 'gavel'])
  const stage = stageOf(st)
  assert.equal(stage.next?.id, 'check')
  assert.equal(stage.name, 'Hunting')
  assert.equal(stageOf(journeyStatus({ ...fresh, onboarded: true, cashUsd: 1, homeState: 'TX', guidesRead: ['first-car'], watched: 3, watchedSources: 2, paperBids: 3, carsOwned: 1, carsWithCosts: 1, materialsTicked: 3, soldOrRented: 1 }, JOURNEY.map((j) => j.id))).name, 'Selling and growing')
})

test("today's three: the next step, the urgent thing, a habit; ticks stick for the day", () => {
  const next = JOURNEY[3]
  const t = todayTasks({ next, urgent: { id: 'loss-1', title: 'A car lost $800', body: 'b', href: '#business' }, stage: 2, budgetUsd: 5000, done: ['urgent-loss-1'] })
  assert.deepEqual(t.map((x) => x.id), ['step-shortlist', 'urgent-loss-1', 'habit-deals'])
  assert.equal(t[1].done, true)
  assert.match(t[2].title, /\$5,000/)
  assert.equal(todayTasks({ next, stage: 1, done: [] }).length, 3, 'always three, even with nothing urgent')
})

test('the streak counts days in a row, ending today or yesterday', () => {
  const d = (n: number) => new Date(T - n * DAY).toISOString().slice(0, 10)
  assert.equal(streak({}, T), 0)
  assert.equal(streak({ [d(0)]: ['a'], [d(1)]: ['b'], [d(2)]: ['c'], [d(4)]: ['x'] }, T), 3)
  assert.equal(streak({ [d(1)]: ['b'], [d(2)]: ['c'] }, T), 2, 'not broken until today ends')
  assert.equal(streak({ [d(2)]: ['c'] }, T), 0)
})

test('threads close after the turn cap and the next one carries a short note', () => withUser('coach1@example.com', () => {
  const s = readCoach()
  const t1 = currentThread(s, T)
  t1.display.push({ role: 'user', text: 'TEST FIXTURE question', at: T }, { role: 'coach', text: 'TEST FIXTURE answer', at: T })
  t1.turns = MAX_TURNS
  const t2 = currentThread(s, T)
  assert.notEqual(t1.id, t2.id)
  assert.match(carryOver(s, t2), /TEST FIXTURE answer/)
  newThread(s, T)
  writeCoach(s)
  assert.equal(readCoach().threads.length, 3)
}))

test('offline answers: the checklist, where to buy, the walkthrough, the day', () => {
  const status = journeyStatus(fresh, [])
  const ctx = { status, today: todayTasks({ next: JOURNEY[0], stage: 1, done: [] }), stageName: 'Getting set up', books: {} as never, briefing: { headline: '', sub: '', items: [] } }
  assert.match(coachFromRules('What should I look for before I bid?', ctx), /VIN/)
  const where = coachFromRules('Which auctions can I buy at?', ctx)
  assert.match(where, /GSA|GovDeals/)
  assert.match(where, /dealer licence/)
  const walk = coachFromRules('Walk me through buying my first car', ctx)
  assert.match(walk, /→ 1\. Set your goal/)
  assert.match(coachFromRules('plan my day', ctx), /Today's three/)
})

test('the agent loop: Gavel tools run, server tools are recorded, pause_turn resumes, citations kept', async () => {
  const replies: CoachMsg[] = [
    { model: 'test', stop_reason: 'tool_use', content: [{ type: 'server_tool_use', name: 'web_search', input: { query: 'GSA auction buyer fee' } }, { type: 'tool_use', id: 'tu1', name: 'find_deals', input: { budget: 5000 } }] },
    { model: 'test', stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_fetch', input: { url: 'https://example.invalid/fees' } }] },
    { model: 'test', stop_reason: 'end_turn', content: [{ type: 'text', text: 'TEST FIXTURE: two leads at $5,000. Next step: open #deals.', citations: [{ url: 'https://example.invalid/fees', title: 'Fees' }] }] },
  ]
  const seen: unknown[] = []
  const client: CoachClient = { beta: { messages: { stream: (p) => { seen.push(p); return { finalMessage: async () => replies.shift()! } } } } }
  let ran: unknown = null
  const tools: CoachTool[] = [{ name: 'find_deals', description: 'd', input_schema: { type: 'object' }, label: (i) => `Ran deals at ${i.budget}`, run: async (i) => { ran = i; return { deals: 2 } } }]
  const a = await coachTurn([], 'Find me deals', tools, client)
  assert.ok(a)
  assert.deepEqual(ran, { budget: 5000 })
  assert.deepEqual(a.activity.map((x) => x.kind), ['search', 'tool', 'read'])
  assert.equal(a.citations[0].url, 'https://example.invalid/fees')
  assert.match(a.text, /two leads/)
  assert.equal(a.appended.length, 5, 'user, assistant, tool results, assistant (paused), assistant')
  const last = seen[seen.length - 1] as { messages: unknown[]; tools: Array<{ type?: string; name: string }> }
  assert.equal(last.messages.length, 4, 'the paused turn is re-sent, with no extra user message')
  assert.ok(last.tools.some((t) => t.type === 'web_search_20260209') && last.tools.some((t) => t.type === 'web_fetch_20260209'))
})

test('the agent refuses to pass on a promise word, and a refusal falls back to the rules', async () => {
  const one = (msg: CoachMsg): CoachClient => ({ beta: { messages: { stream: () => ({ finalMessage: async () => msg }) } } })
  assert.equal(await coachTurn([], 'q', [], one({ model: 't', stop_reason: 'end_turn', content: [{ type: 'text', text: 'This flip is guaranteed.' }] })), null)
  assert.equal(await coachTurn([], 'q', [], one({ model: 't', stop_reason: 'refusal', content: [] })), null)
  assert.equal(await coachTurn([], 'q', []), null, 'no key, no AI')
})
