import { moneyExact } from '@/lib/format'
import type { Quote } from '@/lib/types'

/** `credit`: AVANT credit put towards this trip, shown after the total with what's left to pay. */
export function PriceBreakdown({ quote, notes = true, credit = 0 }: { quote: Quote; notes?: boolean; credit?: number }) {
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
      {credit > 0 ? (
        <>
          <div className="quote-line" data-negative="true">
            <dt>
              AVANT credit
              {notes ? <small>From your Circle wallet. Comes back as credit if the trip is refunded.</small> : null}
            </dt>
            <dd>−{moneyExact(credit)}</dd>
          </div>
          <div className="quote-line quote-total">
            <dt>Due today</dt>
            <dd>{moneyExact(quote.totalCents - credit)}</dd>
          </div>
        </>
      ) : null}
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
