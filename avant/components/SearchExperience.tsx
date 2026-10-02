'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BODY_TYPES } from '@/lib/catalog'
import { cars as fleet, cityName } from '@/lib/data'
import { billableDays, todayIso } from '@/lib/dates'
import { SORTS, activeFilterCount, applySearch, clearFilters, parseSearch, toSearchParams } from '@/lib/search'
import { actions, useLocal } from '@/lib/store'
import type { SearchState } from '@/lib/types'
import { CarCard } from './CarCard'
import { FilterSheet } from './Filters'
import { Icon } from './Icons'
import { PriceMap } from './PriceMap'
import { SearchBar } from './SearchBar'
import { ButtonLink, Empty } from './ui'

const PAGE = 12

export function SearchExperience() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const state = useMemo(() => parseSearch(params), [params])
  const { allIn } = useLocal()
  const [today, setToday] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [active, setActive] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => setToday(todayIso()), [])
  useEffect(() => setLimit(PAGE), [params])

  const set = useCallback(
    (next: SearchState) => {
      const qs = toSearchParams(next).toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname],
  )

  const results = useMemo(() => (today ? applySearch(fleet, state, cityName, today) : []), [state, today])
  const days = state.start && state.end ? billableDays(state.start, '10:00', state.end, '10:00') : undefined
  const n = activeFilterCount(state)
  const onActivate = useCallback((id: string | null) => setActive(id), [])

  return (
    <>
      <div className="search-top">
        <div className="wrap">
          <SearchBar key={`${state.city}|${state.start}|${state.end}`} initial={state} onApply={(p) => set({ ...state, ...p })} />
          <div className="chips-scroll" role="group" aria-label="Quick filters">
            <button type="button" className="chip" onClick={() => setSheet(true)}>
              <Icon name="filter" size={15} /> Filters{n ? ` · ${n}` : ''}
            </button>
            {BODY_TYPES.map((b) => {
              const on = state.bodies.length === 1 && state.bodies[0] === b.id
              return (
                <button key={b.id} type="button" className="chip" aria-pressed={on} onClick={() => set({ ...state, bodies: on ? [] : [b.id] })}>
                  {b.label}
                </button>
              )
            })}
            <button type="button" className="chip" aria-pressed={state.fuels.includes('electric')} onClick={() => set({ ...state, fuels: state.fuels.includes('electric') ? [] : ['electric'] })}>
              <Icon name="bolt" size={14} /> Electric
            </button>
            <button type="button" className="chip" aria-pressed={state.delivery} onClick={() => set({ ...state, delivery: !state.delivery })}>
              <Icon name="truck" size={14} /> Delivers
            </button>
          </div>
        </div>
      </div>

      <div className="search-split" data-view={view}>
        <section className="search-list" aria-label="Results">
          <div className="search-bar2">
            <p aria-live="polite">
              {today ? (
                <>
                  <strong>{results.length}</strong> <span className="muted">cars · {state.city ? cityName(state.city) : 'all cities'}{days ? ` · ${days} days` : ''}</span>
                </>
              ) : (
                <span className="muted">Finding cars…</span>
              )}
            </p>
            <div className="row">
              <div className="segmented" role="group" aria-label="Price shown">
                <button type="button" aria-pressed={allIn} onClick={() => actions.setAllIn(true)}>
                  All-in
                </button>
                <button type="button" aria-pressed={!allIn} onClick={() => actions.setAllIn(false)}>
                  Rate
                </button>
              </div>
              <label>
                <span className="sr-only">Sort</span>
                <select className="select" style={{ minHeight: 38, padding: '6px 34px 6px 12px', borderRadius: 999 }} value={state.sort} onChange={(e) => set({ ...state, sort: e.target.value as SearchState['sort'] })}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {today && fleet.length === 0 ? (
            <Empty
              icon="key"
              title="No cars listed here yet"
              body="AVANT is just opening. If you have a car, you could be the first host in your city."
              action={<ButtonLink href="/host/new" icon="plus">List your car</ButtonLink>}
            />
          ) : today && results.length === 0 ? (
            <Empty
              icon="search"
              title="Nothing here yet"
              body={n ? 'Loosen a filter or two; your city and dates stay put.' : 'Try another city or shift the dates by a day.'}
              action={
                <button type="button" className="btn btn-primary btn-md" onClick={() => set(n ? clearFilters(state) : { ...state, start: '', end: '' })}>
                  {n ? 'Clear filters' : 'Any dates'}
                </button>
              }
            />
          ) : null}

          <div className="cargrid">
            {results.slice(0, limit).map((car, i) => (
              <CarCard
                key={car.id}
                car={car}
                days={days}
                active={active === car.id}
                onHover={onActivate}
                priority={i < 3}
                href={state.start && state.end ? `/cars/${car.slug}?start=${state.start}&end=${state.end}` : undefined}
              />
            ))}
            {!today ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" aria-hidden="true" />) : null}
          </div>
          {results.length > limit ? (
            <div className="row" style={{ justifyContent: 'center', marginTop: 28 }}>
              <button type="button" className="btn btn-secondary btn-md" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({results.length - limit})
              </button>
            </div>
          ) : null}
        </section>

        <aside className="search-map" aria-label="Map">
          <PriceMap cars={results} focusCity={state.city} activeId={active} onActivate={onActivate} />
        </aside>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-md view-toggle"
        style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--tab) + 18px + env(safe-area-inset-bottom))', zIndex: 35 }}
        onClick={() => setView((v) => (v === 'list' ? 'map' : 'list'))}
      >
        <Icon name={view === 'list' ? 'map' : 'list'} size={16} />
        {view === 'list' ? 'Map' : 'List'}
      </button>

      <FilterSheet open={sheet} onClose={() => setSheet(false)} state={state} onChange={set} count={results.length} />
    </>
  )
}
