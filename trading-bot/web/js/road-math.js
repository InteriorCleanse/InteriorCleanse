/**
 * ROAD TO LIVE — the steps between paper and real money, read from the app's
 * own records. Pure: it takes what /api/validation, /api/ops/first-fill,
 * /api/ops/checkpoints and /api/live/status already report and turns it into
 * one ordered list. It estimates nothing (no "days to go"), and no step that
 * belongs to the owner is ever marked done by software.
 */

/** @typedef {'done'|'progress'|'waiting'|'owner'} StepStatus */

const pct = (v, t) => (t > 0 && v !== null && v !== undefined ? Math.max(0, Math.min(1, v / t)) : 0)

export function buildRoad({ validation, firstFill, checkpoints, live }) {
  const steps = []
  const gates = validation && validation.gates ? validation.gates : null
  const liveGates = live && Array.isArray(live.gates) ? live.gates : []
  const lg = (name) => liveGates.find((g) => g.name === name) || null

  // 1. Real paper evidence: every validation gate met on a real PAPER record.
  if (gates) {
    const counts = gates.gates.filter((g) => ['tradesTotal', 'weeks', 'soak'].includes(g.id))
    steps.push({
      id: 'paper', title: 'Real paper evidence', who: 'time',
      status: gates.verdict === 'GATES MET' ? 'done' : gates.metCount > 0 ? 'progress' : 'waiting',
      progress: gates.total ? gates.metCount / gates.total : 0,
      summary: `${gates.metCount} of ${gates.total} validation gates met.`,
      detail: gates.gates.map((g) => ({ label: g.label || g.id, met: !!g.met, value: g.value, threshold: g.threshold, unit: g.value === null || g.value === undefined ? 'NOT ENOUGH DATA' : g.unit, fill: g.met ? 1 : counts.includes(g) ? pct(g.value, g.threshold) : 0 })),
      how: 'Keep the paper soak running (start-fleet-24-7.bat). The gates fill in as real paper trades close across weeks, sessions and regimes. Nothing can speed this up without faking data.',
    })
  } else steps.push({ id: 'paper', title: 'Real paper evidence', who: 'time', status: 'waiting', progress: 0, summary: 'The validation report is not available.', detail: [], how: 'Open Validation to see why.' })

  // 2. First paper fill accepted.
  const ff = firstFill ? String(firstFill.status || '') : ''
  steps.push({
    id: 'firstfill', title: 'First paper fill accepted', who: 'time',
    status: ff === 'ACCEPTED' ? 'done' : ff && ff !== 'WAITING' ? 'progress' : 'waiting', progress: ff === 'ACCEPTED' ? 1 : 0,
    summary: ff === 'ACCEPTED' ? 'The first fill passed every check from market data to reconciliation.' : ff === 'WAITING' || !ff ? 'Waiting for the first paper fill.' : `First fill: ${ff}.`,
    detail: firstFill && Array.isArray(firstFill.chain) ? firstFill.chain.map((c) => ({ label: c.name, met: /PASS|OK|ACCEPT/.test(String(c.status)), value: null, threshold: null, unit: String(c.status), fill: /PASS|OK|ACCEPT/.test(String(c.status)) ? 1 : 0 })) : [],
    how: 'Happens on its own when the engine takes its first paper trade. Operations → First fill shows each check.',
  })

  // 3. Paper checkpoints reviewed by the owner (10/25/50/100/200 fills).
  // `all` is every checkpoint on record; `reached` is only the ones this read crossed.
  const reached = checkpoints && Array.isArray(checkpoints.all) ? checkpoints.all : []
  const reviewed = reached.filter((c) => c && c.reviewed).length
  steps.push({
    id: 'checkpoints', title: 'Paper checkpoints reviewed', who: 'you',
    status: reached.length && reviewed === reached.length && reached.length >= 5 ? 'done' : reached.length ? 'owner' : 'waiting',
    progress: reached.length ? reviewed / Math.max(5, reached.length) : 0,
    summary: reached.length ? `${reviewed} of ${reached.length} reached checkpoints reviewed.` : `No checkpoint reached yet${checkpoints && checkpoints.next ? `; next is ${checkpoints.next.label}` : ''}.`,
    detail: [], how: 'At 10, 25, 50, 100 and 200 paper fills, read the checkpoint in Operations and mark it reviewed. Only you can.',
  })

  // 4. Shadow record: the orders it would have sent, scored against real trades.
  const sh = validation && validation.shadow ? validation.shadow : null
  const scored = sh ? sh.scoredOrders || 0 : 0
  const keyMissing = sh ? (sh.blockers || []).some((b) => /read-only exchange key/i.test(b)) : true
  steps.push({
    id: 'shadow', title: 'Shadow record (20 scored orders)', who: 'time',
    status: sh && sh.status === 'READY' ? 'done' : scored > 0 ? 'progress' : 'waiting', progress: pct(scored, 20),
    summary: `${scored} of 20 shadow orders scored.`, detail: [],
    how: 'After the paper gates pass: add a READ-ONLY exchange key and turn shadow on. Shadow builds the exact order it would send and never sends it.',
  })

  // 5. Exchange account and keys (the owner's).
  steps.push({
    id: 'keys', title: 'Exchange account and API keys', who: 'you',
    status: keyMissing ? 'owner' : 'done', progress: keyMissing ? 0 : 1,
    summary: keyMissing ? 'No read-only exchange key is set.' : 'A read-only exchange key is set.',
    detail: [], how: 'Open an account, fund it only with money you can afford to lose, and put the keys in the .env file on your PC (EXCHANGE_API_KEY / EXCHANGE_API_SECRET). Never in the repository, never in a chat.',
  })

  // 6. Testnet track record.
  const tn = lg('Testnet track record')
  const tnCount = tn ? Number((/Only (\d+)/.exec(tn.reason) || /^(\d+) testnet/.exec(tn.reason) || [0, 0])[1]) : 0
  steps.push({
    id: 'testnet', title: 'Testnet record (20 reconciled trades)', who: 'time',
    status: tn && tn.ok ? 'done' : tnCount > 0 ? 'progress' : 'waiting', progress: tn && tn.ok ? 1 : pct(tnCount, 20),
    summary: tn ? tn.reason : 'Not reported.', detail: [],
    how: 'Point live at the venue\'s testnet (play money on the real venue) and run until 20 trades reconcile with zero mismatches.',
  })

  // 7. Security review.
  steps.push({
    id: 'security', title: 'Security review of the arming change', who: 'you', status: 'owner', progress: 0,
    summary: 'A person reviews the change that turns anything on.', detail: [],
    how: 'Run the secret scan and dependency checks and Claude Code\'s /security-review on the diff. Confirm keys never enter the repo, the record or the logs.',
  })

  // 8. Arm: four keys, all yours.
  const arm = ['Hard flag', 'Config enabled', 'Env phrase', 'Typed confirmation'].map(lg).filter(Boolean)
  steps.push({
    id: 'arm', title: 'Sign-off and arming (four keys)', who: 'you',
    status: live && live.armed ? 'done' : 'owner', progress: arm.length ? arm.filter((g) => g.ok).length / arm.length : 0,
    summary: live && live.armed ? 'Armed.' : `${arm.filter((g) => g.ok).length} of ${arm.length || 4} arming keys set. Trading Bot never arms itself.`,
    detail: arm.map((g) => ({ label: g.name, met: !!g.ok, value: null, threshold: null, unit: g.reason, fill: g.ok ? 1 : 0 })),
    how: `Only after every step above: set the hard flag and config by hand, the MRCASH_LIVE phrase, and type the confirmation. Caps start at their floor${live && live.caps ? ` ($${live.caps.maxNotionalUsd} a trade, ${live.caps.maxTradesPerDay} trades a day, ${live.caps.maxOpenPositions} open)` : ''}.`,
  })

  const done = steps.filter((s) => s.status === 'done').length
  const current = steps.find((s) => s.status !== 'done') || null
  return {
    steps, done, total: steps.length, current,
    verdict: done === steps.length ? 'ARMED' : 'NOT READY',
    line: done === steps.length ? 'Every step is complete.' : current ? `Not ready. ${done} of ${steps.length} steps done; the next is "${current.title}".` : 'Not ready.',
  }
}
