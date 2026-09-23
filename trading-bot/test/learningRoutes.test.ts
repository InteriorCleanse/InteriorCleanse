/**
 * THE SCHOOL / RESEARCH / KNOWLEDGE ROUTES — against a real server with zero
 * paper trades. Every GET answers with labels; every POST is refused without
 * the app's own token; the replay stop carries no answer until one is given;
 * the teacher falls back to the lesson's own text; approval applies nothing.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startBot, startMockFeeds, tempDataDir } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-learnroutes-')
let feeds: MockFeeds
let bot: Awaited<ReturnType<typeof startBot>>
before(async () => { feeds = await startMockFeeds({ days: 40 }); bot = await startBot(feeds, { dir: tmp.dir }) })
after(async () => { bot.stop(); await feeds.close(); tmp.cleanup() })

const get = async (path: string) => (await fetch(`${bot.base}${path}`)).json() as Promise<{ ok: boolean; data?: any; error?: string }>
const status = async (path: string) => (await fetch(`${bot.base}${path}`)).status

test('SCHOOL — the index, a lesson in zero-data mode, cases from the stored history, and the knowledge graph', async () => {
  const s = await get('/api/school')
  assert.equal(s.ok, true)
  assert.ok(s.data.concepts.length >= 20)
  assert.equal(s.data.dataGrowth.band, '0–9')
  assert.deepEqual(s.data.graph.dangling, [])
  assert.match(s.data.note, /Mastery is engagement only/)
  const l = await get('/api/school/lesson?id=liquidity-sweep')
  assert.equal(l.ok, true)
  assert.ok(l.data.sections.every((x: any) => x.evidenceLabel && x.provenance))
  assert.ok(l.data.quiz.every((q: any) => !('answer' in q)), 'the answer key never leaves the server')
  assert.equal(l.data.paperEvidence.status, 'NOT ENOUGH DATA')
  assert.equal(await status('/api/school/lesson?id=nope'), 404)
  const c = await get('/api/school/cases?limit=5')
  assert.equal(c.ok, true)
  assert.ok(Array.isArray(c.data.cases))
  if (c.data.cases.length) {
    const one = await get(`/api/school/case?id=${encodeURIComponent(c.data.cases[0].id)}`)
    assert.equal(one.ok, true)
    assert.ok(one.data.case.before.asOf < one.data.case.at)
  }
  const why = await get('/api/school/why?type=fvg-bullish')
  assert.ok(why.data.concepts.some((k: any) => k.id === 'fair-value-gap'))
  const pm = await get('/api/school/prediction-market?yes=0.46&no=0.51&fee=0.01&slip=0.005&p=0.55')
  assert.equal(pm.data.calc.provenance, 'SIMULATED')
  assert.ok(Math.abs(pm.data.calc.single.edge - 0.03) < 1e-9)
})

test('SCHOOL — POSTs need the app token; a quiz is graded on the server and counted as engagement', async () => {
  const forged = await fetch(`${bot.base}/api/school/quiz`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conceptId: 'sample-size', answers: {} }) })
  assert.equal(forged.status, 403, 'a POST without the token is refused')
  const r = await bot.post('/api/school/quiz', { conceptId: 'sample-size', answers: { 'ss-1': 1, 'ss-2': 2 } })
  const j = await r.json() as any
  assert.equal(j.ok, true)
  assert.equal(j.data.correct, 2)
  const p = await get('/api/school/progress')
  const m = p.data.concepts.find((x: any) => x.conceptId === 'sample-size')
  assert.equal(m.quizzesTaken, 1)
  assert.equal(m.level, 'PRACTISING')
  assert.match(p.data.note, /not trading skill/)
  const bad = await bot.post('/api/school/engage', { kind: 'trade-taken', conceptId: 'bos' })
  assert.equal(bad.status, 400)
  assert.equal(await status('/api/school/quiz'), 405, 'a GET on a POST route says so')
})

test('SCHOOL — the replay stop carries no answer, decision or outcome until an answer is posted', async () => {
  const r = await get('/api/school/replay')
  assert.equal(r.ok, true)
  if (!r.data.lesson.stops.length) { assert.match(r.data.note, /NOT ENOUGH DATA/); return }
  const stop = await get('/api/school/replay/stop?k=0')
  assert.equal(stop.ok, true)
  const raw = JSON.stringify(stop.data)
  assert.ok(!raw.includes('"answer"') && !raw.includes('"after"') && !raw.includes('"during"'), 'nothing from the event onward is in the pre-answer payload')
  for (const a of stop.data.frame.annotations) assert.ok(a.knownAt <= stop.data.cursor)
  const ans = await (await bot.post('/api/school/replay/answer', { k: 0, choice: stop.data.stop.question.choices[0] })).json() as any
  assert.equal(ans.ok, true)
  assert.equal(typeof ans.data.correct, 'boolean')
  assert.deepEqual(ans.data.hindsight, [])
  assert.ok(ans.data.after && ans.data.during)
  assert.equal(await status('/api/school/replay/stop?k=99'), 404)
})

test('SCHOOL — the debate is the engine restated, and the teacher without a model returns the lesson\'s own text', async () => {
  const d = await get('/api/school/debate')
  assert.equal(d.ok, true)
  assert.equal(d.data.provenance, 'ENGINE')
  assert.ok(['LONG', 'SHORT', 'LONG WATCH', 'SHORT WATCH', 'NO TRADE'].includes(d.data.judge.engineDecision))
  const t = await (await bot.post('/api/school/teach', { question: 'What is a sweep?', conceptId: 'liquidity-sweep' })).json() as any
  assert.equal(t.ok, true)
  assert.equal(t.data.source, 'deterministic')
  assert.equal(t.data.valid, true)
  assert.ok(t.data.citations.length >= 1)
  const empty = await bot.post('/api/school/teach', { question: '   ' })
  assert.equal(empty.status, 400)
})

test('RESEARCH — zero-data: no questions, the overfitting detector says NOT ENOUGH DATA, the atlas is empty, diffusion refuses', async () => {
  const r = await get('/api/research')
  assert.equal(r.ok, true)
  assert.deepEqual(r.data.questions, [])
  assert.equal(r.data.paperTrades, 0)
  assert.equal(r.data.trials.total, 0)
  const o = await get('/api/research/overfitting')
  assert.equal(o.data.deflated, null)
  assert.match(o.data.note, /NOT ENOUGH DATA/)
  assert.ok(o.data.curve.length >= 5)
  const a = await get('/api/research/atlas?dim=regime')
  assert.equal(a.data.rows.length, 0)
  const h = await get('/api/research/diffusion')
  assert.equal(h.data.fit.status, 'INSUFFICIENT DATA')
})

test('RESEARCH — a hypothesis can be drafted, tested out of sample (INSUFFICIENT DATA at zero trades), reviewed; banned words are refused', async () => {
  const banned = await bot.post('/api/research/hypothesis', { question: 'Is London the best?', hypothesis: 'x', nullHypothesis: 'y', direction: 'positive', cohortFilters: [] })
  assert.equal(banned.status, 400)
  assert.match(((await banned.json()) as any).error, /best/)
  const made = await (await bot.post('/api/research/hypothesis', { question: 'Does London have a positive mean R?', hypothesis: 'London mean R is positive.', nullHypothesis: 'London mean R is zero.', direction: 'positive', cohortFilters: [{ dimension: 'session', values: ['london'] }], session: 'london' })).json() as any
  assert.equal(made.ok, true)
  assert.equal(made.data.status, 'UNTESTED')
  const tested = await (await bot.post('/api/research/hypothesis/test', { id: made.data.id, stage: 'outOfSample' })).json() as any
  assert.equal(tested.ok, true)
  assert.equal(tested.data.status, 'INSUFFICIENT DATA')
  assert.equal(tested.data.outOfSample.trades, 0)
  const list = await get('/api/research/hypotheses?status=INSUFFICIENT%20DATA')
  assert.ok(list.data.some((x: any) => x.id === made.data.id))
  const reviewed = await (await bot.post('/api/research/hypothesis/review', { id: made.data.id, note: 'looked again' })).json() as any
  assert.equal(reviewed.data.version >= 2, true)
  assert.equal(await status('/api/research/hypothesis?id=nope'), 404)
})

test('RESEARCH — a proposal fails its gates at zero data, a human decision is recorded, and approval changes no config', async () => {
  const cfgBefore = await (await fetch(`${bot.base}/api/config`)).json() as any
  const made = await (await bot.post('/api/research/proposal', { kind: 'parameter-variant', strategyId: 'silver-bullet', title: 'RR 2.5', rationale: 'to see', change: 'rr 2 → 2.5', params: { rr: 2.5 } })).json() as any
  assert.equal(made.ok, true)
  assert.equal(made.data.status, 'GATES FAILED')
  assert.equal(made.data.requires, 'HUMAN APPROVAL')
  assert.ok(made.data.gates.some((g: any) => g.id === 'paper' && !g.met))
  const decide = await bot.post('/api/research/proposal/decide', { id: made.data.id, decision: 'APPROVED', by: 'gt', note: 'x' })
  assert.equal(decide.status, 400, 'a proposal that failed its gates cannot be approved')
  const watch = await (await bot.post('/api/research/proposal', { kind: 'watch', strategyId: 'unicorn', title: 'watch unicorn', rationale: 'curious', change: 'watch list only' })).json() as any
  assert.equal(watch.data.status, 'GATES FAILED', 'even a watch needs the paper sample')
  const unknown = await bot.post('/api/research/proposal', { kind: 'retire', strategyId: 'nope', title: 't', rationale: 'r', change: 'c' })
  assert.equal(unknown.status, 400)
  const trial = await (await bot.post('/api/research/trial', { strategyId: 'silver-bullet', count: 3, note: 'three variants tried by hand' })).json() as any
  assert.equal(trial.data.total, 3)
  const cfgAfter = await (await fetch(`${bot.base}/api/config`)).json() as any
  const strip = (c: any) => { const { csrf, ...rest } = c; return rest }
  assert.deepEqual(strip(cfgAfter), strip(cfgBefore), 'config unchanged by any research action')
})

test('KNOWLEDGE — vault, passport, brief, end of day, weekly, graph, reassess and backfill at zero data', async () => {
  const v = await get('/api/knowledge')
  assert.equal(v.ok, true)
  assert.equal(typeof v.data.summary.total, 'number')
  const p = await get('/api/knowledge/passport?strategy=silver-bullet')
  assert.equal(p.data.strategyId, 'silver-bullet')
  assert.equal(p.data.paper.status, 'NOT ENOUGH DATA')
  assert.ok(p.data.notes.some((n: string) => /The engine reads none of this/.test(n)))
  const b = await get('/api/knowledge/brief')
  assert.equal(b.data.kind, 'DAILY BRIEF')
  assert.equal(b.data.record.evidenceLabel, 'INSUFFICIENT DATA')
  const e = await get('/api/knowledge/eod')
  assert.equal(e.data.kind, 'END OF DAY')
  const w = await get('/api/knowledge/weekly')
  assert.equal(w.data.kind, 'WEEKLY REVIEW')
  assert.match(w.data.reassessment.note, /not run on a read/)
  const g = await get('/api/knowledge/graph')
  assert.ok(g.data.nodes.length >= 20)
  const ra = await (await bot.post('/api/knowledge/reassess', {})).json() as any
  assert.match(ra.data.note, /Nothing was deleted/)
  const bf = await (await bot.post('/api/knowledge/backfill', {})).json() as any
  assert.equal(bf.data.closed, 0)
  assert.equal(await status('/api/knowledge/item?id=nope'), 404)
  assert.equal(await status('/api/knowledge/whatever'), 404)
  const bad = await bot.post('/api/knowledge/review', { id: 'nope', outcome: 'CONFIRMED' })
  assert.equal(bad.status, 404)
})

test('the gates are untouched by the learning layers: live and shadow stay off', async () => {
  const h = await get('/api/health')
  const raw = JSON.stringify(h)
  assert.doesNotMatch(raw, /"live":\s*\{[^}]*"enabled":\s*true/)
  const cfg = await (await fetch(`${bot.base}/api/config`)).json() as any
  assert.notEqual(cfg.liveTradingEnabled, true)
  assert.notEqual(cfg.live?.enabled, true)
  assert.notEqual(cfg.shadow?.enabled, true)
})
