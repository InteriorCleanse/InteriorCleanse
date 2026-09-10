import type { Briefing } from '@/lib/assistant/briefings'
import type { ZipEntry } from '@/lib/zip'

/**
 * Obsidian, in both directions.
 *
 * Obsidian has no cloud API: a vault is a folder of Markdown files on the
 * person's own machine, and the community "Local REST API" plugin listens on
 * localhost — reachable from their laptop, never from a hosted service. Any
 * connector that claims to "sync with Obsidian" from a server is either
 * shipping a desktop agent or lying. This one does neither, and says so on
 * the integrations page.
 *
 * What it does instead is respect the format:
 *
 * **Out: a vault bundle.** Briefings, alerts and the knowledge base rendered
 * as Markdown with YAML frontmatter, foldered the way a vault expects, zipped.
 * Drop the folder in; Obsidian indexes it; Dataview queries the frontmatter.
 * Every figure in a briefing is written as a property as well as prose, so
 * `TABLE net_revenue FROM "Aurelis/Briefings"` works on day one.
 *
 * **In: your notes as knowledge.** Any Markdown file uploaded — from a vault
 * or anywhere — becomes a document the assistant can search and cite.
 * Frontmatter is parsed for a title and a date; wikilinks are kept as text so
 * a note that says `[[Refund policy]]` still reads as a reference.
 *
 * Filenames are the one place a vault is strict: no slashes, no colons, no
 * leading dots, and Obsidian treats `|`, `#`, `^`, `[]` as link syntax.
 */

export type VaultNote = {
  /** Path inside the bundle, e.g. `Aurelis/Briefings/2026-09-10 Morning.md`. */
  path: string
  markdown: string
  modifiedAt: Date
}

const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g

export function safeFilename(title: string, fallback = 'Untitled'): string {
  const cleaned = title.replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  return (cleaned || fallback).slice(0, 120)
}

/** YAML frontmatter for the scalar and list values a note carries. */
export function frontmatter(fields: Record<string, string | number | boolean | null | string[]>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${yamlScalar(item)}`)
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

function yamlScalar(value: string | number | boolean): string {
  if (typeof value !== 'string') return String(value)
  // Quote anything YAML would otherwise reinterpret: colons, leading symbols,
  // things that look like numbers or booleans, and empty strings.
  const needsQuote =
    value === '' ||
    /[:#{}[\],&*?|<>=!%@`'"\\]/.test(value) ||
    /^[\s-]/.test(value) ||
    /^(true|false|null|yes|no|~|\d[\d.,]*)$/i.test(value)
  return needsQuote ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value
}

/** A machine-readable key from a human label: "Net revenue" → net_revenue. */
export function propertyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function briefingNote(briefing: Briefing, at: Date, workspace: string): VaultNote {
  const date = at.toISOString().slice(0, 10)
  const properties: Record<string, string | number | boolean | null | string[]> = {
    type: 'briefing',
    kind: briefing.kind,
    workspace,
    date,
    period: briefing.period,
    currency: briefing.currency,
    demo_data: briefing.isDemo,
    tags: ['aurelis', 'briefing', briefing.kind],
  }
  // Each line as a property, so Dataview can chart it without parsing prose.
  for (const line of briefing.lines) properties[propertyKey(line.label)] = line.value

  const body = [
    `# ${briefing.title} — ${briefing.period}`,
    '',
    briefing.isDemo ? '> [!warning] Demonstration data\n> These figures are synthetic.\n' : '',
    `> [!abstract] ${briefing.headline}`,
    '',
    '## Figures',
    ...briefing.lines.map(
      (line) => `- **${line.label}:** ${line.value}${line.change ? ` (${line.change})` : ''}`,
    ),
    ...(briefing.attention.length
      ? ['', '## Needs a decision', ...briefing.attention.map((a) => `- [ ] ${a}`)]
      : []),
    ...(briefing.caveats.length
      ? ['', '> [!note] Caveats', ...briefing.caveats.map((c) => `> - ${c}`)]
      : []),
    ...(briefing.followUps.length
      ? ['', '## Ask next', ...briefing.followUps.map((q) => `- ${q}`)]
      : []),
  ]
    .filter((line) => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return {
    path: `Aurelis/Briefings/${date} ${safeFilename(briefing.title)}.md`,
    markdown: `${frontmatter(properties)}\n\n${body}\n`,
    modifiedAt: at,
  }
}

export function notificationNote(input: {
  id: string
  title: string
  body: string
  severity: string
  evidence: Record<string, unknown>
  createdAt: Date
  workspace: string
}): VaultNote {
  const date = input.createdAt.toISOString().slice(0, 10)
  const evidence = Object.fromEntries(
    Object.entries(input.evidence).filter(
      (entry): entry is [string, string | number | boolean] =>
        ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  )

  return {
    path: `Aurelis/Alerts/${date} ${safeFilename(input.title)}.md`,
    markdown: `${frontmatter({
      type: 'alert',
      severity: input.severity,
      workspace: input.workspace,
      date,
      tags: ['aurelis', 'alert', input.severity],
      ...evidence,
    })}\n\n# ${input.title}\n\n${input.body}\n`,
    modifiedAt: input.createdAt,
  }
}

export function documentNote(input: {
  title: string
  content: string
  source: string
  url: string | null
  updatedAt: Date | null
}): VaultNote {
  const at = input.updatedAt ?? new Date()
  return {
    path: `Aurelis/Knowledge/${safeFilename(input.source)}/${safeFilename(input.title)}.md`,
    markdown: `${frontmatter({
      type: 'knowledge',
      source: input.source,
      source_url: input.url,
      updated: at.toISOString(),
      tags: ['aurelis', 'knowledge', input.source],
    })}\n\n# ${input.title}\n\n${input.content.trim()}\n`,
    modifiedAt: at,
  }
}

/** A short README so the folder explains itself inside the vault. */
export function vaultReadme(workspace: string, generatedAt: Date): VaultNote {
  return {
    path: 'Aurelis/README.md',
    markdown: `${frontmatter({ type: 'readme', workspace, generated: generatedAt.toISOString() })}

# ${workspace} — exported from Aurelis

Drop this folder anywhere in your vault. Every note carries frontmatter, so
Dataview queries work immediately:

\`\`\`dataview
TABLE net_revenue, contribution_profit FROM "Aurelis/Briefings" SORT date DESC
\`\`\`

- **Briefings/** — one note per briefing, figures as properties and as prose.
- **Alerts/** — one note per notification, with the evidence it was raised on.
- **Knowledge/** — the documents the assistant can cite, by source.

This is a snapshot, not a sync. Obsidian has no cloud API, so nothing here
updates on its own; export again for a newer one. Notes you write in the vault
can be uploaded back as knowledge from the integrations page.
`,
    modifiedAt: generatedAt,
  }
}

export function toZipEntries(notes: readonly VaultNote[]): ZipEntry[] {
  // Two notes with the same path would silently overwrite in the zip. Suffix
  // the later one rather than lose it.
  const seen = new Map<string, number>()
  return notes.map((note) => {
    const count = seen.get(note.path) ?? 0
    seen.set(note.path, count + 1)
    const path = count === 0 ? note.path : note.path.replace(/\.md$/, ` (${count + 1}).md`)
    return { name: path, content: note.markdown, modifiedAt: note.modifiedAt }
  })
}

// ── Inbound ─────────────────────────────────────────────────────────────────

export type ParsedNote = {
  title: string
  content: string
  /** From frontmatter `date`/`updated`/`created`, if present and parseable. */
  updatedAt: Date | null
}

/**
 * Reads a Markdown file as a knowledge document.
 *
 * Title precedence: frontmatter `title`, then the first `#` heading, then the
 * filename. Frontmatter is stripped from the content — it is metadata, not
 * prose the assistant should quote — but wikilinks stay as written, because
 * `[[Refund policy]]` in a note is a reference a reader understands.
 */
export function parseMarkdownNote(filename: string, raw: string): ParsedNote {
  let body = raw.replace(/^\uFEFF/, '')
  const meta: Record<string, string> = {}

  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body)
  if (fm) {
    for (const line of fm[1]!.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
      if (match) meta[match[1]!.toLowerCase()] = match[2]!.trim().replace(/^["']|["']$/g, '')
    }
    body = body.slice(fm[0].length)
  }

  const heading = /^#\s+(.+)$/m.exec(body)
  const title =
    meta.title ||
    heading?.[1]?.trim() ||
    filename.replace(/\.(md|markdown|txt)$/i, '').split('/').pop() ||
    'Untitled'

  const stamp = meta.updated ?? meta.date ?? meta.created ?? null
  const parsed = stamp ? new Date(stamp) : null

  return {
    title: title.slice(0, 300),
    content: body.trim(),
    updatedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  }
}
