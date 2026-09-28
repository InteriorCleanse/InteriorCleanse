/**
 * Concierge history integrity. The chat lives in the browser, so the server
 * signs each reply it sends and only accepts assistant turns that carry a
 * valid signature for this session. A caller can therefore not put words in
 * the concierge's mouth, or pad the context with forged "assistant" text.
 */

import { sign, verify } from './crypto.ts'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
  sig?: string
}

const message = (sessionId: string, content: string) => `turn:${sessionId}:${content}`

export function signTurn(sessionId: string, content: string, key: Uint8Array): Promise<string> {
  return sign(message(sessionId, content), key)
}

/**
 * Drops assistant turns without a valid signature, then merges any user
 * turns that end up adjacent so the conversation still alternates.
 */
export async function trustedHistory(turns: Turn[], sessionId: string, key: Uint8Array): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const t of turns) {
    if (t.role === 'assistant' && !(t.sig && (await verify(message(sessionId, t.content), t.sig, key)))) continue
    const prev = kept[kept.length - 1]
    if (prev && prev.role === t.role) prev.content = `${prev.content}\n\n${t.content}`
    else kept.push({ role: t.role, content: t.content })
  }
  while (kept.length && kept[0].role !== 'user') kept.shift()
  return kept
}
