import { describe, expect, it } from 'vitest'
import {
  ACTION_COMMANDS,
  filterCommands,
  navCommands,
  scoreCommand,
  type Command,
} from '@/lib/commands'

const NAV = [
  { href: '/app/command-center', label: 'Command center' },
  { href: '/app/revenue', label: 'Revenue' },
  { href: '/app/pipeline', label: 'Pipeline' },
]

const commands: Command[] = [...navCommands(NAV), ...ACTION_COMMANDS]

describe('navCommands', () => {
  it('builds a go-to command per nav item, carrying its href', () => {
    const built = navCommands(NAV)
    expect(built).toHaveLength(3)
    expect(built[0]).toMatchObject({ href: '/app/command-center', group: 'Go to', label: 'Command center' })
  })
})

describe('scoreCommand', () => {
  it('ranks exact over prefix over word-start over substring over keyword', () => {
    const revenue = commands.find((c) => c.label === 'Revenue')!
    expect(scoreCommand(revenue, 'revenue')).toBe(100)
    expect(scoreCommand(revenue, 'rev')).toBe(80)
    const center = commands.find((c) => c.label === 'Command center')!
    // "cen" starts the second word, not the label.
    expect(scoreCommand(center, 'cen')).toBe(70)
    expect(scoreCommand(center, 'mman')).toBe(50)
    const assistant = commands.find((c) => c.id === 'act:assistant')!
    expect(scoreCommand(assistant, 'chat')).toBe(30) // keyword prefix
  })

  it('returns 0 for no match and 1 for an empty query', () => {
    const revenue = commands.find((c) => c.label === 'Revenue')!
    expect(scoreCommand(revenue, 'zzz')).toBe(0)
    expect(scoreCommand(revenue, '')).toBe(1)
  })
})

describe('filterCommands', () => {
  it('returns everything, in order, for an empty query', () => {
    expect(filterCommands(commands, '')).toEqual(commands)
    expect(filterCommands(commands, '   ')).toEqual(commands)
  })

  it('surfaces the best label match first', () => {
    const results = filterCommands(commands, 'rev')
    expect(results[0]!.label).toBe('Revenue')
  })

  it('finds a command by keyword when the label does not contain the query', () => {
    // "ai" is a keyword of the assistant command; its label has no "ai".
    const results = filterCommands(commands, 'ai')
    expect(results.some((c) => c.id === 'act:assistant')).toBe(true)
  })

  it('drops non-matches', () => {
    expect(filterCommands(commands, 'zzzzz')).toEqual([])
  })

  it('breaks score ties by the shorter label, so the tightest match wins', () => {
    // Both "Pipeline" and nothing else match "pipe"; add a synthetic longer one.
    const withLong: Command[] = [
      ...commands,
      { id: 'x', label: 'Pipeline settings and configuration', group: 'Go to' },
    ]
    const results = filterCommands(withLong, 'pipe')
    expect(results[0]!.label).toBe('Pipeline')
  })

  it('offers the three theme actions', () => {
    expect(filterCommands(commands, 'theme').map((c) => c.action)).toEqual(
      expect.arrayContaining(['theme:arch', 'theme:dark', 'theme:light']),
    )
  })
})
