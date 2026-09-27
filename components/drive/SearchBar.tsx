'use client'

/**
 * Where, when, go. One form, three fields, and it lands on /drive/cars/ with
 * the search in the URL. Shown on the home page and, compact, on results.
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cities } from '@/lib/drive/data'
import { addDays, todayIso, weekendFrom } from '@/lib/drive/dates'
import { searchHref } from '@/lib/drive/search'
import type { SearchState } from '@/lib/drive/types'
import { Button } from './ui'
import { Icon } from './Icons'

export function SearchBar({
  initial,
  compact = false,
  onSubmit,
}: {
  initial?: Partial<SearchState>
  compact?: boolean
  /** When given, the search is applied in place instead of navigating. */
  onSubmit?: (patch: Pick<SearchState, 'city' | 'start' | 'end' | 'q'>) => void
}) {
  const router = useRouter()
  const [city, setCity] = useState(initial?.city ?? '')
  const [q, setQ] = useState(initial?.q ?? '')
  const [start, setStart] = useState(initial?.start ?? '')
  const [end, setEnd] = useState(initial?.end ?? '')
  const [error, setError] = useState<string | null>(null)
  const today = todayIso()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if ((start && !end) || (!start && end)) {
      setError('Pick both a pickup and a return date, or leave both empty.')
      return
    }
    if (start && end && end < start) {
      setError('The return date is before the pickup date.')
      return
    }
    setError(null)
    const patch = { city, start, end, q }
    if (onSubmit) onSubmit(patch)
    else router.push(searchHref({ ...initial, ...patch }))
  }

  const preset = (s: string, en: string) => {
    setStart(s)
    setEnd(en)
    setError(null)
  }
  const weekend = weekendFrom(today)

  return (
    <form className={`dr-search${compact ? ' dr-search-compact' : ''}`} onSubmit={submit} role="search" aria-label="Find a car">
      <div className="dr-search-field">
        <label htmlFor="dr-search-city">
          <Icon name="pin" size={16} /> Where
        </label>
        <select id="dr-search-city" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Anywhere</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}, {c.state}
            </option>
          ))}
        </select>
      </div>
      <div className="dr-search-field">
        <label htmlFor="dr-search-start">
          <Icon name="calendar" size={16} /> Pickup
        </label>
        <input
          id="dr-search-start"
          type="date"
          min={today}
          value={start}
          onChange={(e) => {
            setStart(e.target.value)
            if (end && e.target.value && end < e.target.value) setEnd(addDays(e.target.value, 1))
          }}
        />
      </div>
      <div className="dr-search-field">
        <label htmlFor="dr-search-end">
          <Icon name="calendar" size={16} /> Return
        </label>
        <input id="dr-search-end" type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      {!compact ? (
        <div className="dr-search-field">
          <label htmlFor="dr-search-q">
            <Icon name="search" size={16} /> Looking for
          </label>
          <input
            id="dr-search-q"
            type="search"
            placeholder="Tesla, convertible, seats 7…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      ) : null}
      <Button type="submit" size={compact ? 'md' : 'lg'} icon="search">
        {compact ? 'Update' : 'Search cars'}
      </Button>
      {error ? (
        <p className="dr-error dr-search-error" role="alert">
          {error}
        </p>
      ) : null}
      {!compact ? (
        <div className="dr-search-presets" aria-label="Quick dates">
          <button type="button" onClick={() => preset(weekend.start, weekend.end)}>
            This weekend
          </button>
          <button type="button" onClick={() => preset(addDays(today, 1), addDays(today, 4))}>
            Next 3 days
          </button>
          <button type="button" onClick={() => preset(addDays(today, 7), addDays(today, 14))}>
            A week from now
          </button>
          <button type="button" onClick={() => preset('', '')}>
            Any dates
          </button>
        </div>
      ) : null}
    </form>
  )
}
