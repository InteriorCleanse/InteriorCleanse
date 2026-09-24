import type { ThemeValue } from '@/lib/theme'

/**
 * The command palette's data and matching, kept pure so it can be tested
 * without a browser.
 *
 * A command is either a place to go (`href`) or a thing to do (`action`). The
 * matcher ranks by how the query meets the label and keywords — an exact hit
 * first, then a word-start, then a run inside the label, then a keyword — so
 * typing "rev" surfaces Revenue before it surfaces anything that merely
 * contains those letters. Nothing here reaches the network or the DOM.
 */

export type CommandAction = 'assistant' | `theme:${ThemeValue}`

export type Command = {
  id: string
  label: string
  group: string
  keywords?: string[]
  href?: string
  action?: CommandAction
}

/** Places, built from the app's own nav so the two never drift. */
export function navCommands(nav: readonly { href: string; label: string }[]): Command[] {
  return nav.map((item) => ({
    id: `go:${item.href}`,
    label: item.label,
    group: 'Go to',
    href: item.href,
    keywords: ['open', 'navigate', item.label.toLowerCase()],
  }))
}

/** Things to do, independent of the nav. */
export const ACTION_COMMANDS: Command[] = [
  { id: 'act:assistant', label: 'Ask the assistant', group: 'Actions', action: 'assistant', keywords: ['chat', 'ai', 'question', 'aurelis'] },
  { id: 'act:theme-arch', label: 'Theme: Arch', group: 'Theme', action: 'theme:arch', keywords: ['dark', 'futuristic', 'default', 'hud'] },
  { id: 'act:theme-dark', label: 'Theme: Dark', group: 'Theme', action: 'theme:dark', keywords: ['night'] },
  { id: 'act:theme-light', label: 'Theme: Light', group: 'Theme', action: 'theme:light', keywords: ['day', 'bright'] },
]

function normalise(text: string): string {
  return text.toLowerCase().trim()
}

/**
 * Scores a command against a query. Higher is better; 0 means no match.
 * The tiers are deliberately far apart so their order never depends on the
 * length tie-breaker applied afterward.
 */
export function scoreCommand(command: Command, query: string): number {
  const q = normalise(query)
  if (!q) return 1
  const label = normalise(command.label)

  if (label === q) return 100
  if (label.startsWith(q)) return 80
  // A word within the label starting with the query (e.g. "rev" → "Revenue"
  // even when the label is "Net revenue").
  if (label.split(/\s+/).some((word) => word.startsWith(q))) return 70
  if (label.includes(q)) return 50
  if ((command.keywords ?? []).some((k) => normalise(k).startsWith(q))) return 30
  if ((command.keywords ?? []).some((k) => normalise(k).includes(q))) return 20
  return 0
}

/** Matching commands, best first; the full list, in given order, for an empty query. */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = normalise(query)
  if (!q) return [...commands]
  return commands
    .map((command) => ({ command, score: scoreCommand(command, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.command.label.length - b.command.label.length)
    .map((entry) => entry.command)
}
