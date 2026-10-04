import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Design or decode your key, see one flat price, verify ownership, and we cut and code it at your vehicle. No phone tag, no surprise on arrival.',
}

const STEPS = [
  ['01 / DESIGN or DECODE', 'Build a custom key in the studio, or enter your VIN to decode the exact key your car takes.'],
  ['02 / FLAT PRICE', 'See one all-in price in writing before anything moves. Parts, cutting, coding, trip, tax. No "starting at."'],
  ['03 / VERIFY', 'Upload your ID and registration at checkout. We verify ownership on every order, so a stolen car can never get a key.'],
  ['04 / CUT & CODE', 'A verified tech comes to you, or a mail-in kit ships with guided programming. The key is always coded at the vehicle.'],
]

export default function HowItWorks() {
  return (
    <main className="wrap" style={{ paddingBlock: '34px 60px' }}>
      <div className="kicker">How it works</div>
      <h1>Four steps, no phone tag</h1>
      <p className="sub">The whole job is decided before a tech leaves the shop. That is the opposite of how this trade usually works.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginTop: 28 }}>
        {STEPS.map(([n, body]) => (
          <div className="card" key={n}>
            <div className="cat">{n}</div>
            <p style={{ color: 'var(--ink)', fontSize: '0.98rem' }}>{body}</p>
          </div>
        ))}
      </div>

      <div className="trust" style={{ marginTop: 30 }}>
        <div className="tbox">
          <div className="n">[✓] TWO WAYS TO GET KEYED</div>
          <h3>Come to you, or mail-in</h3>
          <p>Emergency, all-keys-lost, or you just want it handled: a credentialed tech arrives with a live ETA. Prefer cheaper and on your schedule? The mail-in kit ships cut, with the app walking you through programming step by step.</p>
        </div>
        <div className="tbox alert">
          <div className="n" style={{ color: 'var(--alert)' }}>[!] THE ONE RULE</div>
          <h3>Coded at the vehicle</h3>
          <p>No one can safely program a car key over the internet. We design, cut, customize, verify and schedule online; the key itself is coded at the car. That is the law and the physics, and it is also what keeps your car yours.</p>
        </div>
      </div>
    </main>
  )
}
