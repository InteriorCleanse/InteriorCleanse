/**
 * Replay intelligence and LOOK-AHEAD LEAKAGE (Phase 22H).
 *
 * This is the most important test file in the intelligence layer. A chart that
 * shows you a break of structure before the candle that broke it is worse than
 * useless — it is a machine for convincing yourself of an edge you never had.
 *
 * The frames are built by stepping the REAL engine one candle at a time, so
 * these assertions are about the actual system, not a stub of it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupDay } from '../fixtures/candles.ts'
import { IctEngine } from '../../src/ictStrategy.ts'
import { contextFor, voteAll, metaById } from '../../src/strategies/registry.ts'
import { fuse } from '../../src/fusion.ts'
import { buildReplayFrames, auditFrames, isLeakFree, frameAt, jumpToEvent, eventFrameIndices } from '../../src/intel/replay.ts'
import type { ReplayIntel } from '../../src/intel/replay.ts'

const NOW = 1_700_000_000_000

/** Step the engine candle by candle, exactly as the live loop does. */
function buildIntel(): ReplayIntel {
  const { candles } = setupDay()
  const engine = new IctEngine(candles)
  const steps = candles.map((candle, i) => {
    const analysis = engine.step(i)
    const votes = voteAll(contextFor(analysis, candles))
    const decision = fuse({ votes, metaById: metaById(), regime: analysis.features.regime.value?.state ?? null })
    // Only the candles up to `i` — exactly what the engine itself has seen.
    return { candle, view: { analysis, candles: candles.slice(0, i + 1), votes, decision, now: NOW } }
  })
  return buildReplayFrames({ symbol: 'BTCUSDT', timeframe: '5m', engineVersion: 'test-1', steps, now: NOW })
}

test('a replay produces one frame per candle, in order', () => {
  const { candles } = setupDay()
  const intel = buildIntel()
  assert.equal(intel.frames.length, candles.length)
  for (let i = 1; i < intel.frames.length; i++) {
    assert.ok(intel.frames[i].time > intel.frames[i - 1].time, 'frames must advance in time')
    assert.equal(intel.frames[i].index, i)
  }
})

test('NO LOOK-AHEAD: the audit finds nothing', () => {
  const intel = buildIntel()
  const findings = auditFrames(intel)
  assert.deepEqual(findings, [], `look-ahead leakage detected:\n${findings.map((f) => `${f.problem} @${f.frameIndex} ${f.annotationType}: ${f.detail}`).join('\n')}`)
  assert.equal(isLeakFree(intel), true)
})

test('NO LOOK-AHEAD: no frame contains an event from a later candle', () => {
  const intel = buildIntel()
  for (const f of intel.frames) {
    for (const a of f.annotations) {
      assert.ok(a.eventTime <= f.time, `frame ${f.index} shows ${a.annotationType} from the future (event ${a.eventTime} > frame ${f.time})`)
      assert.ok(a.knownAt <= f.time, `frame ${f.index} shows ${a.annotationType} before it was knowable`)
    }
  }
})

test('NO LOOK-AHEAD: an annotation never appears in a frame earlier than the one that first knew it', () => {
  const intel = buildIntel()
  const firstFrame = new Map<string, number>()
  for (const f of intel.frames) {
    for (const a of f.annotations) {
      if (!firstFrame.has(a.id)) firstFrame.set(a.id, f.time)
      // Once seen, its knownAt must never be later than the frame that showed it.
      assert.ok(a.knownAt <= firstFrame.get(a.id)!, `${a.annotationType} first shown at ${firstFrame.get(a.id)} but claims knownAt ${a.knownAt}`)
    }
  }
})

test('the audit actually catches leakage when it is introduced', () => {
  // Deliberately poison one frame: a real bug would look exactly like this.
  const intel = buildIntel()
  const target = intel.frames[5]
  const poisoned: ReplayIntel = {
    ...intel,
    frames: intel.frames.map((f, i) => i !== 5 ? f : {
      ...f,
      annotations: [...f.annotations, { ...target.annotations[0], id: 'leak.test', knownAt: f.time + 60_000, eventTime: f.time + 60_000 }],
    }),
  }
  const findings = auditFrames(poisoned)
  assert.ok(findings.length > 0, 'the audit must detect an annotation from the future')
  assert.ok(findings.some((f) => f.problem === 'known-after-frame'), `expected known-after-frame, got ${findings.map((x) => x.problem).join(',')}`)
  assert.equal(isLeakFree(poisoned), false)
})

test('the audit catches an annotation claiming to be known before it happened', () => {
  const intel = buildIntel()
  const f0 = intel.frames[10]
  const poisoned: ReplayIntel = {
    ...intel,
    frames: intel.frames.map((f, i) => i !== 10 ? f : {
      ...f,
      annotations: [{ ...f0.annotations[0], id: 'impossible.test', eventTime: f.time, knownAt: f.time - 60_000 }],
    }),
  }
  assert.ok(auditFrames(poisoned).some((x) => x.problem === 'known-before-event'))
})

test('replay is deterministic: two identical runs give identical frames', () => {
  const a = buildIntel()
  const b = buildIntel()
  assert.equal(a.frames.length, b.frames.length)
  for (let i = 0; i < a.frames.length; i++) {
    assert.deepEqual(a.frames[i].annotations.map((x) => x.id), b.frames[i].annotations.map((x) => x.id), `frame ${i} differs`)
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})

test('frames accumulate knowledge — later frames know at least as much', () => {
  const intel = buildIntel()
  const last = intel.frames[intel.frames.length - 1]
  const first = intel.frames[0]
  assert.ok(last.annotations.length >= first.annotations.length, 'the engine should know more by the end of the day')
})

test('deltas describe what changed, and the first frame is a baseline', () => {
  const intel = buildIntel()
  assert.equal(intel.frames[0].delta.changes.length, 0, 'the first frame must not report a burst of changes')
  assert.match(intel.frames[0].delta.note, /baseline/i)
  const withChanges = intel.frames.filter((f) => f.delta.changes.length > 0)
  assert.ok(withChanges.length > 0, 'something must change over the setup day')
})

test('the player can scrub, and jump between frames that carry events', () => {
  const intel = buildIntel()
  const mid = intel.frames[Math.floor(intel.frames.length / 2)]
  const found = frameAt(intel, mid.time)
  assert.equal(found?.index, mid.index)
  // A cursor between two frames resolves to the earlier one — never the later.
  const between = frameAt(intel, mid.time + 1)
  assert.equal(between?.index, mid.index)
  assert.equal(frameAt(intel, 0), null)

  const idx = eventFrameIndices(intel)
  assert.ok(idx.length > 0)
  const next = jumpToEvent(intel, -1, 1)
  assert.equal(next, idx[0])
  assert.equal(jumpToEvent(intel, idx[idx.length - 1], 1), null, 'there is nothing after the last event')
})

test('every frame is tagged with its own replay timestamp', () => {
  const intel = buildIntel()
  for (const f of intel.frames) {
    for (const a of f.annotations) assert.equal(a.replayTimestamp, f.time)
  }
})
