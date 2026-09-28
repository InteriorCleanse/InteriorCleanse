'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cities } from '@/lib/data'
import { addDays, todayIso, weekendFrom } from '@/lib/dates'
import { searchHref } from '@/lib/search'
import type { SearchState } from '@/lib/types'
import { Icon } from './Icons'

export function SearchBar({
  initial,
  onApply,
  presets = false,
}: {
  initial?: Partial<SearchState>
  onApply?: (p: Pick<SearchState, 'city' | 'start' | 'end'>) => void
  presets?: boolean
}) {
  const router = useRouter()
  const [city, setCity] = useState(initial?.city ?? '')
  const [start, setStart] = useState(initial?.start ?? '')
  const [end, setEnd] = useState(initial?.end ?? '')
  const [error, setError] = useState<string | null>(null)
  const today = todayIso()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (Boolean(start) !== Boolean(end)) return setError('Add both dates, or leave both empty.')
    if (start && end && end < start) return setError('Return is before pickup.')
    setError(null)
    if (onApply) onApply({ city, start, end })
    else router.push(searchHref({ ...initial, city, start, end }))
  }
  const set = (s: string, e: string) => {
    setStart(s)
    setEnd(e)
  }
  const wk = weekendFrom(today)

  return (
    <div>
      <form className="searchbar" role="search" aria-label="Find a car" onSubmit={submit}>
        <div className="searchbar-field">
          <label htmlFor="sb-city">Where</label>
          <select id="sb-city" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Anywhere</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}, {c.state}
              </option>
            ))}
          </select>
        </div>
        <div className="searchbar-field">
          <label htmlFor="sb-start">Pickup</label>
          <input
            id="sb-start"
            type="date"
            min={today}
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              if (end && e.target.value > end) setEnd(addDays(e.target.value, 2))
            }}
          />
        </div>
        <div className="searchbar-field">
          <label htmlFor="sb-end">Return</label>
          <input id="sb-end" type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-lg">
          <Icon name="search" size={18} />
          Search
        </button>
      </form>
      {error ? (
        <p className="error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
      {presets ? (
        <div className="presets" aria-label="Quick dates">
          <button type="button" onClick={() => set(wk.start, wk.end)}>
            This weekend
          </button>
          <button type="button" onClick={() => set(addDays(today, 1), addDays(today, 4))}>
            Tomorrow, 3 days
          </button>
          <button type="button" onClick={() => set(addDays(today, 7), addDays(today, 14))}>
            Next week
          </button>
          <button type="button" onClick={() => set('', '')}>
            Flexible
          </button>
        </div>
      ) : null}
    </div>
  )
}
