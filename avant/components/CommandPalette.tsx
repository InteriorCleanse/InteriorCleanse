'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { carTitle, cars, cities, cityName } from '@/lib/data'
import { todayIso, weekendFrom } from '@/lib/dates'
import { money } from '@/lib/format'
import { searchHref } from '@/lib/search'
import { useModalDialog } from '@/lib/use-modal-dialog'
import { Icon, type IconName } from './Icons'
import { NAV } from './nav'

interface Item {
  id: string
  group: 'Go to' | 'Quick search' | 'Cars'
  label: string
  hint?: string
  icon: IconName
  href: string
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const ref = useModalDialog(open, onClose)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const wk = weekendFrom(todayIso())
    const pages: Item[] = NAV.map((n) => ({ id: n.href, group: 'Go to', label: n.label, hint: `g ${n.key}`, icon: n.icon, href: n.href }))
    const quick: Item[] = [
      { id: 'wk', group: 'Quick search', label: 'Anything this weekend', icon: 'calendar', href: searchHref({ start: wk.start, end: wk.end }) },
      { id: 'ev', group: 'Quick search', label: 'Electric cars', icon: 'bolt', href: searchHref({ fuels: ['electric'] }) },
      { id: 'deliver', group: 'Quick search', label: 'Delivered to me, instant book', icon: 'truck', href: searchHref({ delivery: true, instantBook: true }) },
      ...cities.map<Item>((c) => ({ id: `city-${c.slug}`, group: 'Quick search', label: `Cars in ${c.name}`, icon: 'pin', href: searchHref({ city: c.slug }) })),
    ]
    const fleet: Item[] = cars.map((c) => ({
      id: c.id,
      group: 'Cars',
      label: carTitle(c),
      hint: `${cityName(c.city)} · ${money(c.dailyRateCents)}/day`,
      icon: 'trips',
      href: `/cars/${c.slug}`,
    }))
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return [...pages, ...quick.slice(0, 3)]
    return [...pages, ...quick, ...fleet].filter((i) => words.every((w) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(w))).slice(0, 14)
  }, [q])

  useEffect(() => setCursor(0), [q])

  if (!open) return null

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  let last = ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="palette" role="dialog" aria-modal="true" aria-label="Jump to" tabIndex={-1}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="A page, a city, a car…"
            aria-label="Search pages, cities and cars"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[cursor] ? `pal-${items[cursor].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(items.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (items[cursor]) go(items[cursor].href)
                else if (q.trim()) go(searchHref({ q: q.trim() }))
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <ul id="palette-list" role="listbox" className="palette-list">
          {items.length === 0 ? <li className="muted" style={{ padding: 14 }}>Press Enter to search every car for “{q}”.</li> : null}
          {items.map((it, i) => {
            const head = it.group !== last ? it.group : null
            last = it.group
            return (
              <li key={it.id} role="presentation">
                {head ? <div className="palette-group">{head}</div> : null}
                <button
                  type="button"
                  id={`pal-${it.id}`}
                  role="option"
                  aria-selected={i === cursor}
                  className="palette-item"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(it.href)}
                >
                  <Icon name={it.icon} size={17} />
                  <span>{it.label}</span>
                  {it.hint ? <span className="small dim">{it.hint}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="palette-foot">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>g + letter jumps anywhere</span>
        </div>
      </div>
    </div>
  )
}
