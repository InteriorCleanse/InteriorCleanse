'use client'

import { useEffect, useRef, useState } from 'react'

export type Option = { value: string; label: string; hint?: string }

export function Dropdown({
  label, value, options, onChange, placeholder = 'Select…', searchable = false, disabled = false,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (v: string) => void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement | null>(null)
  const selected = options.find((o) => o.value === value)
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  useEffect(() => { if (!open) setQ('') }, [open])

  const choose = (v: string) => { onChange(v); setOpen(false) }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active].value) }
  }

  return (
    <div className={`dd${disabled ? ' disabled' : ''}`} ref={ref}>
      <span className="dd-label">{label}</span>
      <button
        type="button" className={`dd-btn${open ? ' open' : ''}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => !disabled && setOpen((o) => !o)} onKeyDown={onKey}
      >
        <span className={selected ? 'dd-val' : 'dd-ph'}>{selected ? selected.label : placeholder}</span>
        <span className="dd-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="dd-panel" role="listbox">
          {searchable && (
            <input
              className="dd-search" autoFocus placeholder="Type to filter…" value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={onKey}
            />
          )}
          <div className="dd-list">
            {filtered.length === 0 ? (
              <div className="dd-empty">No matches</div>
            ) : filtered.map((o, i) => (
              <button
                type="button" key={o.value} role="option" aria-selected={o.value === value}
                className={`dd-opt${o.value === value ? ' sel' : ''}${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.hint ? <span className="dd-hint">{o.hint}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
