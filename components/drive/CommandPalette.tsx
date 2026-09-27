'use client'

/**
 * ⌘K. One box that reaches every page, every car and the common actions,
 * so nothing in Drive is more than a keystroke and a few letters away.
 *
 * Built on the site's `useModalDialog` so focus is trapped, Escape closes,
 * and focus returns to wherever it came from.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useModalDialog } from '@/lib/use-modal-dialog'
import { cars, carTitle, cityName } from '@/lib/drive/data'
import { DRIVE, PRIMARY_NAV, SECONDARY_NAV } from '@/lib/drive/routes'
import { searchHref } from '@/lib/drive/search'
import { todayIso, weekendFrom } from '@/lib/drive/dates'
import { money } from '@/lib/drive/format'
import { Icon, type DriveIconName } from './Icons'
import { Kbd } from './ui'

export interface PaletteAction {
  id: string
  label: string
  icon: DriveIconName
  hint?: string
  run: () => void
}

interface Item {
  id: string
  group: 'Pages' | 'Actions' | 'Cars'
  label: string
  hint?: string
  icon: DriveIconName
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  actions,
}: {
  open: boolean
  onClose: () => void
  actions: PaletteAction[]
}) {
  const router = useRouter()
  const ref = useModalDialog(open, onClose)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // The dialog hook focuses the first focusable element, which is the input.
    }
  }, [open])

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const pages: Item[] = [
      { id: 'home', group: 'Pages', label: 'Drive home', icon: 'home', run: () => go(DRIVE.home) },
      ...[...PRIMARY_NAV, ...SECONDARY_NAV].map<Item>((n) => ({
        id: n.href,
        group: 'Pages',
        label: n.label,
        hint: `g ${n.key}`,
        icon: n.icon,
        run: () => go(n.href),
      })),
      { id: 'host-new', group: 'Pages', label: 'List your car', icon: 'plus', run: () => go(DRIVE.hostNew) },
    ]
    const weekend = weekendFrom(todayIso())
    const quick: Item[] = [
      {
        id: 'weekend',
        group: 'Actions',
        label: 'Search this weekend',
        hint: 'Sat to Mon',
        icon: 'calendar',
        run: () => go(searchHref({ start: weekend.start, end: weekend.end })),
      },
      {
        id: 'electric',
        group: 'Actions',
        label: 'Electric cars only',
        icon: 'bolt',
        run: () => go(searchHref({ fuels: ['electric'] })),
      },
      {
        id: 'instant',
        group: 'Actions',
        label: 'Instant book, delivered',
        icon: 'sparkle',
        run: () => go(searchHref({ instantBook: true, delivery: true })),
      },
      ...actions.map<Item>((a) => ({ id: a.id, group: 'Actions', label: a.label, hint: a.hint, icon: a.icon, run: () => { onClose(); a.run() } })),
    ]
    const fleet: Item[] = cars.map<Item>((c) => ({
      id: c.id,
      group: 'Cars',
      label: carTitle(c),
      hint: `${cityName(c.city)} · ${money(c.dailyRateCents)}/day`,
      icon: 'trips',
      run: () => go(DRIVE.car(c.slug)),
    }))
    const all = [...pages, ...quick, ...fleet]
    if (!q) return [...pages, ...quick, ...fleet.slice(0, 5)]
    const words = q.split(/\s+/).filter(Boolean)
    return all
      .filter((item) => {
        const text = `${item.label} ${item.hint ?? ''}`.toLowerCase()
        return words.every((w) => text.includes(w))
      })
      .slice(0, 14)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, actions])

  useEffect(() => setCursor(0), [items.length, query])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(items.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[cursor]
      if (item) item.run()
      else if (query.trim()) go(searchHref({ q: query.trim() }))
    }
  }

  if (!open) return null

  let lastGroup = ''
  return (
    <div className="dr-palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dr-palette" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1}>
        <div className="dr-palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to a page, a car, or an action…"
            aria-label="Search pages, cars and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="dr-palette-list"
            aria-activedescendant={items[cursor] ? `dr-pal-${items[cursor].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>esc</Kbd>
        </div>
        <ul id="dr-palette-list" role="listbox" className="dr-palette-list">
          {items.length === 0 ? (
            <li className="dr-palette-empty">
              No matches. Press <Kbd>Enter</Kbd> to search the fleet for “{query}”.
            </li>
          ) : null}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <li key={item.id} role="presentation">
                {header ? <div className="dr-palette-group">{header}</div> : null}
                <button
                  type="button"
                  id={`dr-pal-${item.id}`}
                  role="option"
                  aria-selected={i === cursor}
                  className="dr-palette-item"
                  onMouseEnter={() => setCursor(i)}
                  onClick={item.run}
                >
                  <Icon name={item.icon} size={17} />
                  <span className="dr-palette-label">{item.label}</span>
                  {item.hint ? <span className="dr-palette-hint">{item.hint}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="dr-palette-foot">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>↵</Kbd> open
          </span>
          <span>
            <Kbd>g</Kbd> then a letter jumps anywhere
          </span>
        </div>
      </div>
    </div>
  )
}
