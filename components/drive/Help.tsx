'use client'

import { useMemo, useState } from 'react'
import { FREE_CANCEL_HOURS } from '@/lib/drive/config'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/lib/drive/routes'
import { Kbd } from './ui'

const FAQ: { q: string; a: string; tags: string }[] = [
  { q: 'Do I need an account?', a: 'No. You can search, save cars, book trips and message hosts without signing in. Everything is kept in this browser, and the Account page lets you export or clear it.', tags: 'account sign in login' },
  { q: 'Is anything actually charged?', a: 'No. Drive is a demonstration built on a sample fleet. Every host, car and review is generated, and no payment is taken at any step.', tags: 'payment card money demo sample' },
  { q: 'How is the price worked out?', a: 'Daily rate × days, minus any weekly or monthly discount the host set, plus a 10% trip fee, the protection plan you choose (a percentage of the trip), any delivery or extras, and estimated local taxes. Every line is itemised before you confirm.', tags: 'price fee cost total tax' },
  { q: 'What counts as a day?', a: 'A 24-hour block from the pickup time, rounded up. Friday 10:00 to Sunday 14:00 is three days.', tags: 'day hours time billing' },
  { q: 'Can I cancel?', a: `Free until ${FREE_CANCEL_HOURS} hours before pickup, from the trip page. Inside that window one day is forfeited.`, tags: 'cancel refund change' },
  { q: 'What do the protection plans cover?', a: 'Basic has the lowest cost and a $3,000 deductible. Standard has a $500 deductible and 24/7 roadside assistance. Complete has no deductible. You choose at booking and each is priced against your trip.', tags: 'protection insurance deductible damage' },
  { q: 'What is instant book?', a: 'Cars with the bolt badge confirm the moment you book. Others send a request the host answers, usually within the response time shown on their profile.', tags: 'instant request host' },
  { q: 'How does delivery work?', a: 'Some hosts bring the car to you within a radius for a flat fee, shown on the car page. Choose it in the first booking step and add the address.', tags: 'delivery airport address' },
  { q: 'What if I go over the mileage?', a: 'Each car includes a daily allowance. Add the Unlimited miles extra at booking if you are unsure, or expect a per-mile charge from the host afterwards.', tags: 'miles mileage allowance' },
  { q: 'How do I list my own car?', a: 'Host → List your car. Four short steps: the car, where it is picked up, the price (with a suggestion from similar cars) and your rules. Drafts are saved on this device.', tags: 'host list earn' },
  { q: 'Can I use the keyboard for everything?', a: 'Yes. ⌘K or Ctrl-K opens the palette from anywhere, / does too, and g followed by a letter jumps to a section. The full list is below.', tags: 'keyboard shortcuts accessibility' },
  { q: 'Why is the map schematic?', a: 'It is drawn from the fleet data rather than loaded from a map provider, so nothing is fetched from a third party and the pins show prices. Exact pickup spots are shared after booking.', tags: 'map location pins' },
]

export function HelpCenter() {
  const [q, setQ] = useState('')
  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return FAQ
    return FAQ.filter((f) => words.every((w) => `${f.q} ${f.a} ${f.tags}`.toLowerCase().includes(w)))
  }, [q])

  return (
    <div className="dr-help">
      <div className="dr-field dr-help-search">
        <label htmlFor="dr-help-q" className="dr-label">
          Search help
        </label>
        <input id="dr-help-q" type="search" placeholder="cancel, price, keyboard…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section aria-labelledby="dr-faq" className="dr-faq">
        <h2 id="dr-faq" className="dr-h2">
          Questions <span className="dr-muted">({items.length})</span>
        </h2>
        {items.length === 0 ? <p className="dr-muted">Nothing matches. Try a single word.</p> : null}
        {items.map((f) => (
          <details key={f.q} open={Boolean(q)}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section id="shortcuts" aria-labelledby="dr-shortcuts" className="dr-shortcuts">
        <h2 id="dr-shortcuts" className="dr-h2">
          Keyboard shortcuts
        </h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">
                <Kbd>⌘</Kbd> <Kbd>K</Kbd> or <Kbd>/</Kbd>
              </th>
              <td>Open the palette: pages, cars, actions</td>
            </tr>
            <tr>
              <th scope="row">
                <Kbd>g</Kbd> then <Kbd>d</Kbd>
              </th>
              <td>Drive home</td>
            </tr>
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((n) => (
              <tr key={n.href}>
                <th scope="row">
                  <Kbd>g</Kbd> then <Kbd>{n.key}</Kbd>
                </th>
                <td>{n.label}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">
                <Kbd>?</Kbd>
              </th>
              <td>This list</td>
            </tr>
            <tr>
              <th scope="row">
                <Kbd>Esc</Kbd>
              </th>
              <td>Close any sheet or the palette</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
