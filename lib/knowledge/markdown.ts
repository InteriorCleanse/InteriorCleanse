/**
 * Notion blocks to Markdown.
 *
 * Notion's API returns a page as a tree of typed blocks, each carrying an
 * array of "rich text" runs with their own annotations. What the assistant
 * needs is plain, citable Markdown. The conversion is deliberately lossy in
 * one direction only: nothing textual is dropped, but layout that carries no
 * meaning — colours, column blocks, synced-block wrappers — is flattened.
 *
 * Rules that matter:
 *
 * **An unknown block type becomes its text, not nothing.** Notion adds block
 * types faster than any converter tracks them. A block we do not recognise
 * still has rich text more often than not, and losing a paragraph because it
 * was a `callout` variant we had not seen is worse than rendering it plainly.
 *
 * **Links are kept as links.** A note that says "see the refund policy" with
 * the policy linked is worth more than the sentence alone, and the assistant
 * can cite the URL.
 *
 * **Code is fenced, tables are tables.** Both are structure the model reads
 * correctly; a code block rendered as prose is a recipe for it quoting a
 * command wrongly.
 */

export type RichText = {
  plain_text?: string
  href?: string | null
  annotations?: {
    bold?: boolean
    italic?: boolean
    code?: boolean
    strikethrough?: boolean
  }
}

export type NotionBlock = {
  id?: string
  type: string
  has_children?: boolean
  children?: NotionBlock[]
  [key: string]: unknown
}

type Typed = {
  rich_text?: RichText[]
  text?: RichText[]
  caption?: RichText[]
  language?: string
  checked?: boolean
  url?: string
  external?: { url?: string }
  file?: { url?: string }
  cells?: RichText[][]
  expression?: string
}

export function richTextToMarkdown(runs: RichText[] | undefined): string {
  if (!runs) return ''
  return runs
    .map((run) => {
      let text = run.plain_text ?? ''
      if (!text) return ''
      const a = run.annotations ?? {}
      if (a.code) text = `\`${text}\``
      if (a.bold) text = `**${text}**`
      if (a.italic) text = `*${text}*`
      if (a.strikethrough) text = `~~${text}~~`
      if (run.href) text = `[${text}](${run.href})`
      return text
    })
    .join('')
}

export function blocksToMarkdown(blocks: NotionBlock[], depth = 0): string {
  const out: string[] = []
  const indent = '  '.repeat(depth)
  let numbered = 0

  for (const block of blocks) {
    const body = (block[block.type] ?? {}) as Typed
    const text = richTextToMarkdown(body.rich_text ?? body.text)
    const children = block.children?.length ? blocksToMarkdown(block.children, depth + 1) : ''

    // Numbered lists count within a run of siblings; anything else resets.
    if (block.type !== 'numbered_list_item') numbered = 0

    switch (block.type) {
      case 'heading_1':
        out.push(`${indent}# ${text}`)
        break
      case 'heading_2':
        out.push(`${indent}## ${text}`)
        break
      case 'heading_3':
        out.push(`${indent}### ${text}`)
        break
      case 'paragraph':
        if (text) out.push(`${indent}${text}`)
        break
      case 'bulleted_list_item':
        out.push(`${indent}- ${text}`)
        break
      case 'numbered_list_item':
        numbered += 1
        out.push(`${indent}${numbered}. ${text}`)
        break
      case 'to_do':
        out.push(`${indent}- [${body.checked ? 'x' : ' '}] ${text}`)
        break
      case 'toggle':
        out.push(`${indent}- ${text}`)
        break
      case 'quote':
        out.push(`${indent}> ${text}`)
        break
      case 'callout':
        out.push(`${indent}> ${text}`)
        break
      case 'code':
        out.push(`${indent}\`\`\`${body.language ?? ''}\n${text}\n${indent}\`\`\``)
        break
      case 'divider':
        out.push(`${indent}---`)
        break
      case 'equation':
        out.push(`${indent}$$${body.expression ?? ''}$$`)
        break
      case 'bookmark':
      case 'link_preview':
      case 'embed':
        if (body.url) out.push(`${indent}<${body.url}>`)
        break
      case 'image':
      case 'file':
      case 'pdf':
      case 'video': {
        const url = body.external?.url ?? body.file?.url
        const caption = richTextToMarkdown(body.caption) || block.type
        if (url) out.push(`${indent}[${caption}](${url})`)
        break
      }
      case 'table_row':
        if (body.cells) {
          out.push(`${indent}| ${body.cells.map((cell) => richTextToMarkdown(cell)).join(' | ')} |`)
        }
        break
      case 'table':
        // Rows arrive as children; the header rule is inserted after the first.
        if (block.children?.length) {
          const rows = block.children.map((row) => {
            const cells = ((row[row.type] ?? {}) as Typed).cells ?? []
            return `${indent}| ${cells.map((cell) => richTextToMarkdown(cell)).join(' | ')} |`
          })
          const width = ((block.children[0]![block.children[0]!.type] ?? {}) as Typed).cells?.length ?? 1
          rows.splice(1, 0, `${indent}|${' --- |'.repeat(width)}`)
          out.push(rows.join('\n'))
        }
        continue
      case 'child_page':
        out.push(`${indent}- ${String((block.child_page as { title?: string } | undefined)?.title ?? 'Sub-page')}`)
        break
      case 'child_database':
        out.push(`${indent}- ${String((block.child_database as { title?: string } | undefined)?.title ?? 'Database')}`)
        break
      case 'column_list':
      case 'column':
      case 'synced_block':
      case 'template':
        // Layout only. Children carry the content.
        break
      default:
        // Never drop text because the block type was unfamiliar.
        if (text) out.push(`${indent}${text}`)
    }

    if (children) out.push(children)
  }

  const joined = out.join('\n').replace(/\n{3,}/g, '\n\n')
  // Only the top level trims both ends. A nested call's leading whitespace is
  // its indentation, and trimming it flattens every child list to the root.
  return depth === 0 ? joined.trim() : joined.trimEnd()
}

/** The title a Notion page object reports, from whichever property carries it. */
export function pageTitle(page: { properties?: Record<string, unknown> }): string {
  for (const value of Object.values(page.properties ?? {})) {
    const prop = value as { type?: string; title?: RichText[] }
    if (prop?.type === 'title') {
      const text = richTextToMarkdown(prop.title).trim()
      if (text) return text
    }
  }
  return 'Untitled'
}
