import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startMockFeeds, tempDataDir, mcpSession } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-mcp-')
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds({ days: 6 }) })
after(async () => { await feeds.close(); tmp.cleanup() })

test('the MCP server initialises, lists fifteen tools, answers a read-only tool and rejects an unknown one', async () => {
  const replies = await mcpSession(tmp.dir, feeds.url, [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'journal_review', arguments: {} } },
    { id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } },
    { id: 5, method: 'nope' },
    { id: 6, method: 'tools/call', params: { name: 'learn', arguments: {} } },
    { id: 7, method: 'tools/call', params: { name: 'learn', arguments: { concept: 'order-types' } } },
    { id: 8, method: 'tools/call', params: { name: 'strategies', arguments: {} } },
    { id: 9, method: 'tools/call', params: { name: 'backtest', arguments: { strategy: 'fused', trades: 3 } } },
    { id: 10, method: 'tools/call', params: { name: 'backtest', arguments: { strategy: 'no-such' } } },
  ], 90_000)
  const init = replies.get(1) as { result: { serverInfo: { name: string }; capabilities: { tools: object } } }
  assert.equal(init.result.serverInfo.name, 'mr-cash')
  const list = replies.get(2) as { result: { tools: Array<{ name: string; inputSchema: object }> } }
  assert.equal(list.result.tools.length, 15)
  assert.ok(list.result.tools.every((t) => t.inputSchema))
  const journal = replies.get(3) as { result: { content: Array<{ type: string; text: string }>; isError?: boolean } }
  assert.equal(journal.result.content[0].type, 'text')
  assert.notEqual(journal.result.isError, true)
  const unknown = replies.get(4) as { error: { code: number } }
  assert.equal(unknown.error.code, -32602)
  const method = replies.get(5) as { error: { code: number } }
  assert.equal(method.error.code, -32601)
  const text = (id: number) => (replies.get(id) as { result: { content: Array<{ text: string }> } }).result.content[0].text
  assert.match(text(6), /\[basics\]\nwhat-you-trade/, 'the outline starts with the basics')
  assert.match(text(7), /Order types/)
  assert.match(text(7), /Answer key \(for the tutor\)/)
  assert.match(text(7), /Paper trading only/)
  assert.match(text(8), /^session-ifvg — /m)
  assert.match(text(8), /fused — /)
  assert.match(text(9), /^BACKTEST · SIMULATED/, 'a backtest is labelled as simulated before anything else')
  assert.match(text(9), /STRATEGY: fused/)
  assert.match(text(10), /Unknown strategy "no-such"/)
})
