'use client'

/**
 * /drive/cars/. Reads the search from the URL, applies it to the fleet on
 * the client (42 cars need no server round-trip), and writes every change
 * back to the URL with `replace` so the history holds one entry per search,
 * not one per keystroke.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BODY_TYPES } from '@/lib/drive/catalog'
import { cars as fleet, cityName, cities } from '@/lib/drive/data'
import { billableDays, todayIso } from '@/lib/drive/dates'
import { DEFAULT_PICKUP_TIME, DEFAULT_RETURN_TIME } from '@/lib/drive/config'
import { DRIVE } from '@/lib/drive/routes'
import { SORTS, activeFilterCount, applySearch, clearFilters, parseSearch, toSearchParams } from '@/lib/drive/search'
import type { Car, SearchState } from '@/lib/drive/types'
import { CarCard } from './CarCard'
import { FilterPanel, FilterSheet } from './Filters'
import { Icon } from './Icons'
import { ResultsMap } from './ResultsMap'
import { SearchBar } from './SearchBar'
import { Button, Chip, EmptyState } from './ui'

const PAGE = 12

export function SearchResults() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const state = useMemo(() => parseSearch(params), [params])
  const [today, setToday] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)

  // "Today" is the visitor's, so availability is only computed once mounted.
  useEffect(() => setToday(todayIso()), [])
  useEffect(() => setLimit(PAGE), [params])

  const setState = useCallback(
    (next: SearchState) => {
      const qs = toSearchParams(next).toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname],
  )

  const results = useMemo(() => (today ? applySearch(fleet, state, cityName, today) : []), [state, today])
  const days = state.start && state.end ? billableDays(state.start, DEFAULT_PICKUP_TIME, state.end, DEFAULT_RETURN_TIME) : undefined
  const filterCount = activeFilterCount(state)
  const shown = results.slice(0, limit)
  const mapCity = state.city || (results[0]?.city ?? '')

  const summary = [
    state.city ? cityName(state.city) : 'All cities',
    state.start && state.end ? `${days} day${days === 1 ? '' : 's'}` : 'any dates',
    state.q ? `“${state.q}”` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const openCar = (car: Car) => router.push(DRIVE.car(car.slug))

  return (
    <div className="dr-results">
      <div className="dr-results-top">
        <SearchBar
          key={`${state.city}|${state.start}|${state.end}`}
          compact
          initial={state}
          onSubmit={(patch) => setState({ ...state, ...patch })}
        />
      </div>

      <div className="dr-results-chips" role="group" aria-label="Body type">
        <Chip active={state.bodies.length === 0} onClick={() => setState({ ...state, bodies: [] })}>
          All types
        </Chip>
        {BODY_TYPES.map((b) => (
          <Chip
            key={b.id}
            active={state.bodies.length === 1 && state.bodies[0] === b.id}
            onClick={() => setState({ ...state, bodies: state.bodies.length === 1 && state.bodies[0] === b.id ? [] : [b.id] })}
          >
            {b.label}
          </Chip>
        ))}
      </div>

      <div className="dr-results-layout">
        <aside className="dr-results-side" aria-label="Filters">
          <FilterPanel state={state} onChange={setState} />
        </aside>

        <section className="dr-results-main" aria-label="Results">
          <div className="dr-results-bar">
            <p className="dr-results-count" aria-live="polite">
              {today ? (
                <>
                  <strong>{results.length}</strong> {results.length === 1 ? 'car' : 'cars'} · {summary}
                </>
              ) : (
                'Loading…'
              )}
            </p>
            <div className="dr-results-tools">
              <button type="button" className="dr-tool dr-tool-filters" onClick={() => setSheetOpen(true)}>
                <Icon name="filter" size={16} />
                Filters{filterCount ? ` (${filterCount})` : ''}
              </button>
              <label className="dr-tool dr-sort">
                <span className="dr-visually-hidden">Sort by</span>
                <select value={state.sort} onChange={(e) => setState({ ...state, sort: e.target.value as SearchState['sort'] })}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dr-view-toggle" role="group" aria-label="View">
                <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List view">
                  <Icon name="list" size={16} />
                </button>
                <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')} aria-label="Map view">
                  <Icon name="map" size={16} />
                </button>
              </div>
            </div>
          </div>

          {today && results.length === 0 ? (
            <EmptyState
              icon="search"
              title="No cars match"
              body={
                filterCount
                  ? 'Loosen a filter or two. Dates and city stay as they are.'
                  : state.start
                    ? 'Nothing is free on those dates here. Try a nearby city or shift the dates a day.'
                    : 'Try another city or a broader search.'
              }
              action={
                <div className="dr-row">
                  {filterCount ? <Button onClick={() => setState(clearFilters(state))}>Clear filters</Button> : null}
                  <Button variant="secondary" href={DRIVE.cars}>
                    Start over
                  </Button>
                </div>
              }
            />
          ) : null}

          <div className={`dr-results-split${view === 'map' ? ' dr-results-split-map' : ''}`}>
            <div className="dr-results-grid">
              {shown.map((car) => (
                <CarCard key={car.id} car={car} days={days} highlighted={activeId === car.id} onHover={setActiveId} />
              ))}
              {!today ? Array.from({ length: 6 }, (_, i) => <div key={i} className="dr-carcard dr-skeleton" aria-hidden="true" />) : null}
            </div>
            <div className="dr-results-map">
              <ResultsMap cars={results} citySlug={mapCity} activeId={activeId} onActivate={setActiveId} onSelect={openCar} />
              {!state.city && results.length ? (
                <div className="dr-map-cities" role="group" aria-label="Show a city on the map">
                  {cities
                    .filter((c) => results.some((r) => r.city === c.slug))
                    .map((c) => (
                      <Chip key={c.slug} active={mapCity === c.slug} onClick={() => setState({ ...state, city: c.slug })}>
                        {c.name}
                      </Chip>
                    ))}
                </div>
              ) : null}
            </div>
          </div>

          {results.length > shown.length ? (
            <div className="dr-results-more">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, results.length - shown.length)} more
              </Button>
              <p>
                Showing {shown.length} of {results.length}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} state={state} onChange={setState} resultCount={results.length} />
    </div>
  )
}
