import { describe, expect, it } from 'vitest'
import { describeCitation } from '@/components/assistant/AssistantDock'

/**
 * Source chips are the only place an answer says where it came from. A chip
 * reading `doc:6f1a…` says nothing; a chip that follows a `javascript:` link
 * says too much.
 */
describe('source chips', () => {
  it('labels a metric key from the dictionary', () => {
    expect(describeCitation('net_revenue', [])).toEqual({ label: 'Net revenue', href: null })
    expect(describeCitation('knowledge_documents', undefined)).toEqual({
      label: 'Connected notes',
      href: null,
    })
  })

  it('labels a record from the source the tool supplied, with its link', () => {
    const sources = [{ key: 'doc:doc-1', label: 'Refund policy', url: 'https://www.notion.so/refunds' }]
    expect(describeCitation('doc:doc-1', sources)).toEqual({
      label: 'Refund policy',
      href: 'https://www.notion.so/refunds',
    })
  })

  it('keeps the label but drops a link a browser should not follow', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', '/app/knowledge', '', null]) {
      const { label, href } = describeCitation('doc:x', [{ key: 'doc:x', label: 'Note', url }])
      expect(label).toBe('Note')
      expect(href, `${url} became a link`).toBeNull()
    }
  })

  it('shows an unknown key rather than hiding the source', () => {
    expect(describeCitation('something_new', [])).toEqual({ label: 'something_new', href: null })
  })
})
