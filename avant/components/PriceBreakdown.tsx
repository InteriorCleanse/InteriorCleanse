import { moneyExact } from '@/lib/format'
import type { Quote } from '@/lib/types'

export function PriceBreakdown({ quote, notes = true }: { quote: Quote; notes?: boolean }) {
  return (
    <dl className="quote">
      {quote.lines.map((l) => (
        <div key={l.id} className="quote-line" data-negative={l.cents < 0 ? 'true' : undefined}>
          <dt>
            {l.label}
            {notes && l.note ? <small>{l.note}</small> : null}
          </dt>
          <dd>{l.cents < 0 ? `−${moneyExact(-l.cents)}` : moneyExact(l.cents)}</dd>
        </div>
      ))}
      <div className="quote-line quote-total">
        <dt>Total</dt>
        <dd>{moneyExact(quote.totalCents)}</dd>
      </div>
      {quote.depositCents ? (
        <div className="quote-line">
          <dt>
            Refundable hold at pickup
            <small>Released within 48 hours after the trip. Not charged.</small>
          </dt>
          <dd className="muted">{moneyExact(quote.depositCents)}</dd>
        </div>
      ) : null}
    </dl>
  )
}
