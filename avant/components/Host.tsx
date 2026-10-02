'use client'

import { useState } from 'react'
import { BODY_TYPES, HOST_SHARE_PCT } from '@/lib/catalog'
import { cities, medianRateCents } from '@/lib/data'
import { money } from '@/lib/format'
import { hostMonthlyEstimate } from '@/lib/pricing'
import type { BodyType } from '@/lib/types'

export function Estimator() {
  const [body, setBody] = useState<BodyType>('suv')
  const [city, setCity] = useState(cities[0].slug)
  const [days, setDays] = useState(14)
  const rate = medianRateCents(body, city)
  const monthly = hostMonthlyEstimate(rate, days, HOST_SHARE_PCT)
  return (
    <div className="panel">
      <div className="grid-3">
        <label className="field">
          <span className="label">Your car</span>
          <select className="select" value={body} onChange={(e) => setBody(e.target.value as BodyType)}>
            {BODY_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">City</span>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Shared {days} days a month</span>
          <input type="range" min={2} max={28} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ accentColor: 'var(--text)', marginTop: 14 }} />
        </label>
      </div>
      <div className="row" style={{ alignItems: 'baseline', marginTop: 24, gap: 14 }}>
        <span className="display" style={{ fontSize: 'clamp(3.4rem,8vw,6rem)', }}>{money(monthly)}</span>
        <span className="muted">a month, estimated</span>
      </div>
      <p className="small dim" style={{ marginTop: 8 }}>
        Median {BODY_TYPES.find((b) => b.id === body)?.label.toLowerCase()} rate in {cities.find((c) => c.slug === city)?.name}: {money(rate)}/day, and you keep {HOST_SHARE_PCT}%. An estimate from live listings, not a promise.
      </p>
    </div>
  )
}
