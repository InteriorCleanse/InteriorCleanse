import { moneyExact } from '@/lib/drive/format'
import type { Quote } from '@/lib/drive/types'

/** Every line of a quote, with the reason for each fee under it. Server-safe. */
export function PriceBreakdown({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  return (
    <dl className={`dr-quote${compact ? ' dr-quote-compact' : ''}`}>
      {quote.lines.map((line) => (
        <div key={line.id} className="dr-quote-line" data-negative={line.cents < 0 ? 'true' : undefined}>
          <dt>
            {line.label}
            {line.note && !compact ? <small>{line.note}</small> : null}
          </dt>
          <dd>{line.cents < 0 ? `−${moneyExact(-line.cents)}` : moneyExact(line.cents)}</dd>
        </div>
      ))}
      <div className="dr-quote-line dr-quote-total">
        <dt>Total</dt>
        <dd>{moneyExact(quote.totalCents)}</dd>
      </div>
    </dl>
  )
}
