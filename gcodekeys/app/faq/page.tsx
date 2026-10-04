import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about GCode Keys: custom keys, luxury and supercar coverage, pricing, verification, and how programming works.',
}

const QA: [string, string][] = [
  ['Can you really do luxury and supercars?', 'We design and source shells and covers for virtually any vehicle, including luxury and supercars. For cars where only an OEM key will program (some Mercedes FBS4, newest BMW, Ferrari, Lamborghini, McLaren), we coordinate the OEM key and confirm feasibility and price per car before you pay.'],
  ['Are the custom key designs the real shape?', 'The studio renders a faithful representation of each key family so you can see your color, finish and engraving. The physical product is a genuine OEM or aftermarket-compatible shell or key. We do not reproduce a maker’s logo for resale.'],
  ['How is the price set?', 'You see one flat, all-in price in writing before anything ships. The prices shown on the site today are examples; the operator confirms your exact flat price after decoding your vehicle. Nothing is charged until you approve it.'],
  ['Why do you need my ID and registration?', 'Every order is verified: photo ID, registration or title, and a VIN match. It is required by the industry’s security rules and it is how we make sure a stolen car can never get a key here.'],
  ['Do you program the key remotely?', 'No. The key is always programmed at the vehicle. Any service claiming to code a car over the internet would be a theft tool. We handle everything else online: design, quote, verify, schedule.'],
  ['Mail-in or come-to-you?', 'Both. A verified tech can come to you with a live ETA, or a cut-and-coded kit ships with guided, step-by-step programming in the app.'],
]

export default function FAQ() {
  return (
    <main className="wrap" style={{ paddingBlock: '34px 60px', maxWidth: 820 }}>
      <div className="kicker">FAQ</div>
      <h1>Questions, answered straight</h1>
      <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        {QA.map(([q, a]) => (
          <details className="faq" key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </main>
  )
}
