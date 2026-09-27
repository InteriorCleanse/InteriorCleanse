'use client'

/**
 * The filter panel: a sidebar on wide screens, a bottom sheet on phones.
 * Edits go straight into the URL through `onChange`, so every combination is
 * a link and the back button undoes a filter.
 */

import { BODY_TYPES, FEATURES, FILTERABLE_FEATURES, FUELS, TRANSMISSIONS } from '@/lib/drive/catalog'
import { activeFilterCount, clearFilters } from '@/lib/drive/search'
import { useModalDialog } from '@/lib/use-modal-dialog'
import type { BodyType, FeatureId, Fuel, SearchState } from '@/lib/drive/types'
import { Button, Field, Segmented } from './ui'
import { Icon } from './Icons'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterPanel({ state, onChange }: { state: SearchState; onChange: (next: SearchState) => void }) {
  const count = activeFilterCount(state)
  return (
    <div className="dr-filters">
      <div className="dr-filters-head">
        <h2>Filters</h2>
        {count > 0 ? (
          <button type="button" className="dr-link" onClick={() => onChange(clearFilters(state))}>
            Clear {count}
          </button>
        ) : null}
      </div>

      <fieldset className="dr-fieldset">
        <legend>Price per day</legend>
        <div className="dr-price-row">
          <Field label="Min">
            {(p) => (
              <input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                placeholder="0"
                value={state.minCents === null ? '' : state.minCents / 100}
                onChange={(e) => onChange({ ...state, minCents: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 100 })}
              />
            )}
          </Field>
          <Field label="Max">
            {(p) => (
              <input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                placeholder="Any"
                value={state.maxCents === null ? '' : state.maxCents / 100}
                onChange={(e) => onChange({ ...state, maxCents: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 100 })}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Body type</legend>
        <div className="dr-checks">
          {BODY_TYPES.map((b) => (
            <label key={b.id} className="dr-check">
              <input
                type="checkbox"
                checked={state.bodies.includes(b.id)}
                onChange={() => onChange({ ...state, bodies: toggle<BodyType>(state.bodies, b.id) })}
              />
              <span>{b.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Fuel</legend>
        <div className="dr-checks">
          {FUELS.map((f) => (
            <label key={f.id} className="dr-check">
              <input
                type="checkbox"
                checked={state.fuels.includes(f.id)}
                onChange={() => onChange({ ...state, fuels: toggle<Fuel>(state.fuels, f.id) })}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Transmission</legend>
        <Segmented
          label="Transmission"
          value={state.transmission ?? 'any'}
          options={[{ id: 'any', label: 'Any' }, ...TRANSMISSIONS.map((t) => ({ id: t.id, label: t.label }))]}
          onChange={(v) => onChange({ ...state, transmission: v === 'any' ? null : v })}
        />
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Seats</legend>
        <Segmented
          label="Minimum seats"
          value={String(state.minSeats ?? 0)}
          options={[
            { id: '0', label: 'Any' },
            { id: '4', label: '4+' },
            { id: '5', label: '5+' },
            { id: '7', label: '7+' },
          ]}
          onChange={(v) => onChange({ ...state, minSeats: v === '0' ? null : Number(v) })}
        />
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Booking</legend>
        <div className="dr-checks">
          <label className="dr-check">
            <input type="checkbox" checked={state.instantBook} onChange={() => onChange({ ...state, instantBook: !state.instantBook })} />
            <span>
              <Icon name="bolt" size={14} /> Instant book
            </span>
          </label>
          <label className="dr-check">
            <input type="checkbox" checked={state.delivery} onChange={() => onChange({ ...state, delivery: !state.delivery })} />
            <span>
              <Icon name="truck" size={14} /> Delivery offered
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="dr-fieldset">
        <legend>Features</legend>
        <div className="dr-checks">
          {FILTERABLE_FEATURES.map((f) => (
            <label key={f} className="dr-check">
              <input
                type="checkbox"
                checked={state.features.includes(f)}
                onChange={() => onChange({ ...state, features: toggle<FeatureId>(state.features, f) })}
              />
              <span>{FEATURES[f]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

/** The phone presentation: the same panel inside a modal sheet. */
export function FilterSheet({
  open,
  onClose,
  state,
  onChange,
  resultCount,
}: {
  open: boolean
  onClose: () => void
  state: SearchState
  onChange: (next: SearchState) => void
  resultCount: number
}) {
  const ref = useModalDialog(open, onClose)
  if (!open) return null
  return (
    <div className="dr-sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dr-sheet" role="dialog" aria-modal="true" aria-label="Filters" tabIndex={-1}>
        <div className="dr-sheet-handle" aria-hidden="true" />
        <div className="dr-sheet-body">
          <FilterPanel state={state} onChange={onChange} />
        </div>
        <div className="dr-sheet-foot">
          <Button variant="secondary" onClick={() => onChange(clearFilters(state))}>
            Clear
          </Button>
          <Button onClick={onClose}>Show {resultCount} cars</Button>
        </div>
      </div>
    </div>
  )
}
