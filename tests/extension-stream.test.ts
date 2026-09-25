import { describe, expect, it } from 'vitest'
// The extension is plain JavaScript; the parser it uses is tested here so a
// change to the route's stream shape fails a test before it fails a person.
import {
  createLineParser,
  describeCitation,
  emptyTurn,
  reduceTurn,
  speakable,
} from '../extension/lib/stream.js'

type Event = { type: string; [k: string]: unknown }

describe('NDJSON line parser', () => {
  it('emits one event per line, however the chunks are cut', () => {
    const seen: Event[] = []
    const parser = createLineParser((e: Event) => seen.push(e))
    parser.push('{"type":"thread","thr')
    parser.push('eadId":"t1"}\n{"type":"text","text":"Hel')
    parser.push('lo"}\n\n{"type":"do')
    parser.push('ne","citations":[],"sources":[]}')
    parser.flush()
    expect(seen.map((e) => e.type)).toEqual(['thread', 'text', 'done'])
  })

  it('drops a malformed line and keeps going', () => {
    const seen: Event[] = []
    const parser = createLineParser((e: Event) => seen.push(e))
    parser.push('not json\n{"type":"text","text":"ok"}\n{"nope":1}\n')
    expect(seen).toEqual([{ type: 'text', text: 'ok' }])
  })
})

describe('turn reducer', () => {
  it('assembles a turn from the route’s events', () => {
    let turn = emptyTurn('a')
    const events: Event[] = [
      { type: 'thread', threadId: 't1' },
      { type: 'text', text: 'Net revenue ' },
      { type: 'tool_start', id: 'c1', name: 'query_kpis' },
      { type: 'tool_end', id: 'c1', ok: true, citations: ['net_revenue'] },
      { type: 'text', text: 'was up.' },
      { type: 'done', citations: ['net_revenue', 'doc:1'], sources: [{ key: 'doc:1', label: 'Plan', url: 'https://n' }] },
    ]
    for (const e of events) turn = reduceTurn(turn, e)
    expect(turn.threadId).toBe('t1')
    expect(turn.text).toBe('Net revenue was up.')
    expect(turn.tools).toEqual([{ id: 'c1', name: 'query_kpis', ok: true, detail: undefined }])
    expect(turn.done).toBe(true)
    expect(turn.citations).toEqual(['net_revenue', 'doc:1'])
  })

  it('marks an error as failed and finished', () => {
    const turn = reduceTurn(emptyTurn('a'), { type: 'error', message: 'Nothing was changed.' })
    expect(turn.failed).toBe(true)
    expect(turn.done).toBe(true)
    expect(turn.text).toBe('Nothing was changed.')
  })

  it('ignores an event type it does not know', () => {
    const turn = emptyTurn('a')
    expect(reduceTurn(turn, { type: 'future' })).toEqual(turn)
  })
})

describe('citations and speech', () => {
  it('labels metrics and documents the same way the web dock does', () => {
    expect(describeCitation('net_revenue', [])).toEqual({ label: 'Net revenue', href: null })
    expect(describeCitation('doc:1', [{ key: 'doc:1', label: 'Plan', url: 'https://n' }])).toEqual({
      label: 'Plan',
      href: 'https://n',
    })
    expect(describeCitation('doc:1', [{ key: 'doc:1', label: 'Plan', url: 'javascript:1' }]).href).toBeNull()
  })

  it('strips markdown before speaking', () => {
    expect(speakable('**Revenue** was `£1` — see [plan](https://n)\n\n```x```')).toBe(
      'Revenue was £1 — see plan',
    )
  })
})
