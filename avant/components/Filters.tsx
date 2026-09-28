'use client'

import { BODY_TYPES, FEATURES, FILTERABLE_FEATURES, FUELS } from '@/lib/catalog'
import { activeFilterCount, clearFilters } from '@/lib/search'
import { useModalDialog } from '@/lib/use-modal-dialog'
import type { BodyType, FeatureId, Fuel, SearchState } from '@/lib/types'

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function FilterPanel({ state, onChange }: { state: SearchState; onChange: (s: SearchState) => void }) {
  const n = activeFilterCount(state)
  return (
    <div className="filters">
      <div className="between">
        <h2>Filters</h2>
        {n ? (
          <button type="button" className="link" onClick={() => onChange(clearFilters(state))}>
            Clear {n}
          </button>
        ) : null}
      </div>
      <fieldset>
        <legend>Daily rate</legend>
        <div className="grid-2">
          <label className="field">
            <span className="hint">Min $</span>
            <input className="input" type="number" inputMode="numeric" min={0} step={5} value={state.minCents === null ? '' : state.minCents / 100} onChange={(e) => onChange({ ...state, minCents: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 100 })} />
          </label>
          <label className="field">
            <span className="hint">Max $</span>
            <input className="input" type="number" inputMode="numeric" min={0} step={5} placeholder="Any" value={state.maxCents === null ? '' : state.maxCents / 100} onChange={(e) => onChange({ ...state, maxCents: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 100 })} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Type</legend>
        <div className="checks">
          {BODY_TYPES.map((b) => (
            <button key={b.id} type="button" className="chip" aria-pressed={state.bodies.includes(b.id)} onClick={() => onChange({ ...state, bodies: toggle<BodyType>(state.bodies, b.id) })}>
              {b.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Power</legend>
        <div className="checks">
          {FUELS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={state.fuels.includes(f.id)} onClick={() => onChange({ ...state, fuels: toggle<Fuel>(state.fuels, f.id) })}>
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Seats</legend>
        <div className="checks">
          {[0, 4, 5, 7].map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={(state.minSeats ?? 0) === s} onClick={() => onChange({ ...state, minSeats: s || null })}>
              {s ? `${s}+` : 'Any'}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Booking</legend>
        <div className="checks">
          <button type="button" className="chip" aria-pressed={state.instantBook} onClick={() => onChange({ ...state, instantBook: !state.instantBook })}>
            Instant book
          </button>
          <button type="button" className="chip" aria-pressed={state.delivery} onClick={() => onChange({ ...state, delivery: !state.delivery })}>
            Delivers
          </button>
          <button type="button" className="chip" aria-pressed={state.transmission === 'manual'} onClick={() => onChange({ ...state, transmission: state.transmission === 'manual' ? null : 'manual' })}>
            Manual
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Features</legend>
        <div className="checks">
          {FILTERABLE_FEATURES.map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={state.features.includes(f)} onClick={() => onChange({ ...state, features: toggle<FeatureId>(state.features, f) })}>
              {FEATURES[f]}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

export function FilterSheet({ open, onClose, state, onChange, count }: { open: boolean; onClose: () => void; state: SearchState; onChange: (s: SearchState) => void; count: number }) {
  const ref = useModalDialog(open, onClose)
  if (!open) return null
  return (
    <div className="overlay sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label="Filters" tabIndex={-1}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-body">
          <FilterPanel state={state} onChange={onChange} />
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn btn-secondary btn-md" onClick={() => onChange(clearFilters(state))}>
            Clear
          </button>
          <button type="button" className="btn btn-primary btn-md" onClick={onClose}>
            Show {count} cars
          </button>
        </div>
      </div>
    </div>
  )
}
