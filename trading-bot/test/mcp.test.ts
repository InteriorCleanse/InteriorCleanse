import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startMockFeeds, tempDataDir, mcpSession } from './helpers.ts'
import type { MockFeeds } from './helpers.ts'

const tmp = tempDataDir('mrcash-mcp-')
let feeds: MockFeeds
before(async () => { feeds = await startMockFeeds({ days: 6 }) })
after(async () => { await feeds.close(); tmp.cleanup() })

test('the MCP server initialises, lists nine tools, answers a read-only tool and rejects an unknown one', async () => {
  const replies = await mcpSession(tmp.dir, feeds.url, [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'journal_review', arguments: {} } },
    { id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } },
    { id: 5, method: 'nope' },
  ], 40_000)
  const init = replies.get(1) as { result: { serverInfo: { name: string }; capabilities: { tools: object } } }
  assert.equal(init.result.serverInfo.name, 'mr-cash')
  const list = replies.get(2) as { result: { tools: Array<{ name: string; inputSchema: object }> } }
  assert.equal(list.result.tools.length, 9)
  assert.ok(list.result.tools.every((t) => t.inputSchema))
  const journal = replies.get(3) as { result: { content: Array<{ type: string; text: string }>; isError?: boolean } }
  assert.equal(journal.result.content[0].type, 'text')
  assert.notEqual(journal.result.isError, true)
  const unknown = replies.get(4) as { error: { code: number } }
  assert.equal(unknown.error.code, -32602)
  const method = replies.get(5) as { error: { code: number } }
  assert.equal(method.error.code, -32601)
})
