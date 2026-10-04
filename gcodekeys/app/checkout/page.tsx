'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart } from '@/components/CartProvider'

type Step = 0 | 1 | 2 | 3
const STEPS = ['Bag', 'Details', 'Verify', 'Confirm']

export default function Checkout() {
  const { items, total, clear } = useCart()
  const [step, setStep] = useState<Step>(0)
  const [service, setService] = useState<'come' | 'mail'>('come')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [idName, setIdName] = useState('')
  const [regName, setRegName] = useState('')
  const [owns, setOwns] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')

  const empty = items.length === 0

  const detailsOk = name.trim() && /.+@.+\..+/.test(email) && phone.trim() && (service === 'mail' || city.trim())
  const verifyOk = vehicle.trim() && idName && regName && owns

  const place = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/order/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, meta: i.meta })),
          contact: { name, email, phone, city }, service, vehicle,
          docs: { id: !!idName, registration: !!regName }, ownershipConfirmed: owns,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? 'Could not place the request.'); return }
      setRef(d.ref)
      clear()
      setStep(3)
    } catch { setErr('Could not reach the server.') } finally { setBusy(false) }
  }

  return (
    <main className="wrap" style={{ paddingBlock: '34px 60px', maxWidth: 760 }}>
      <div className="kicker">Checkout</div>
      <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>Place your request</h1>

      <ol className="stepper" aria-label="Checkout steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span className="num">{i < step ? '✓' : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {ref ? (
        <Done ref_={ref} email={email} />
      ) : empty ? (
        <div className="panel">
          <p className="muted" style={{ fontFamily: 'var(--mono)' }}>Your bag is empty.</p>
          <Link className="btn" href="/#build" style={{ marginTop: 14, display: 'inline-block' }}>BUILD A FOB</Link>
        </div>
      ) : (
        <div className="panel">
          {step === 0 && (
            <>
              <h2 className="pstep">Your bag</h2>
              {items.map((i) => (
                <div className="line" key={i.key}>
                  <div><div className="ln">{i.name} × {i.qty}</div>{i.meta ? <div className="lm">{i.meta}</div> : null}</div>
                  <div className="lp">${i.price * i.qty}</div>
                </div>
              ))}
              <div className="totalrow"><span>SUBTOTAL</span><span className="amt">${total}</span></div>
              <p className="ex">EXAMPLE PRICING · the operator confirms your flat price in writing before any charge.</p>
              <Nav onNext={() => setStep(1)} nextOk />
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="pstep">How do you want it?</h2>
              <div className="segs" style={{ marginBottom: 16 }}>
                <button className="seg" aria-pressed={service === 'come'} onClick={() => setService('come')}>Come to me</button>
                <button className="seg" aria-pressed={service === 'mail'} onClick={() => setService('mail')}>Mail-in kit</button>
              </div>
              <Field id="name" label="Full name" value={name} set={setName} />
              <Field id="email" label="Email" value={email} set={setEmail} type="email" />
              <Field id="phone" label="Phone" value={phone} set={setPhone} type="tel" />
              {service === 'come' && <Field id="city" label="City / ZIP (for dispatch)" value={city} set={setCity} />}
              <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextOk={!!detailsOk} />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="pstep">Verify ownership</h2>
              <p className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12, marginTop: 0 }}>
                We verify every order so a stolen car can never get a key. Required before we cut.
              </p>
              <Field id="vehicle" label="Vehicle (year / make / model, or VIN)" value={vehicle} set={setVehicle} />
              <Upload id="idUp" label="Photo ID" onName={setIdName} picked={idName} />
              <Upload id="regUp" label="Registration or title (name must match ID)" onName={setRegName} picked={regName} />
              <label className="check">
                <input type="checkbox" checked={owns} onChange={(e) => setOwns(e.target.checked)} />
                <span>I am the owner of this vehicle, or I have the owner&apos;s written authorization.</span>
              </label>
              <p className="ex">Documents are reviewed by the operator. Secure encrypted upload is finalized at launch; nothing is transmitted in this preview.</p>
              <Nav onBack={() => setStep(1)} onNext={place} nextOk={!!verifyOk} nextLabel={busy ? 'SUBMITTING…' : 'PLACE REQUEST'} busy={busy} />
              {err ? <p className="ex" style={{ color: 'var(--alert)', marginTop: 10 }}>{err}</p> : null}
            </>
          )}
        </div>
      )}
    </main>
  )
}

function Nav({ onBack, onNext, nextOk, nextLabel = 'CONTINUE', busy }: { onBack?: () => void; onNext: () => void; nextOk: boolean; nextLabel?: string; busy?: boolean }) {
  return (
    <div className="navrow">
      {onBack ? <button className="btn ghost" onClick={onBack} disabled={busy}>BACK</button> : <span />}
      <button className="btn" onClick={onNext} disabled={!nextOk || busy}>{nextLabel}</button>
    </div>
  )
}

function Field({ id, label, value, set, type = 'text' }: { id: string; label: string; value: string; set: (v: string) => void; type?: string }) {
  return (
    <div className="opt" style={{ marginBottom: 12 }}>
      <label htmlFor={id}>::{label.toUpperCase()}</label>
      <input id={id} className="field" style={{ textTransform: 'none' }} type={type} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  )
}

function Upload({ id, label, onName, picked }: { id: string; label: string; onName: (n: string) => void; picked: string }) {
  return (
    <div className="opt" style={{ marginBottom: 12 }}>
      <label htmlFor={id}>::{label.toUpperCase()}</label>
      <label className={`upload${picked ? ' has' : ''}`} htmlFor={id}>
        {picked ? `✓ ${picked}` : 'TAP TO ATTACH'}
        <input id={id} type="file" accept="image/*" hidden onChange={(e) => onName(e.target.files?.[0]?.name ?? '')} />
      </label>
    </div>
  )
}

function Done({ ref_, email }: { ref_: string; email: string }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div className="bigcheck">✓</div>
      <h2 className="pstep" style={{ justifyContent: 'center' }}>Request received</h2>
      <p className="muted" style={{ fontFamily: 'var(--mono)' }}>Reference <b style={{ color: 'var(--bright)' }}>{ref_}</b></p>
      <p className="sub" style={{ margin: '12px auto 0' }}>
        We&apos;ll review your vehicle and documents, confirm your flat price in writing{email ? ` to ${email}` : ''}, and schedule the cut. Programming happens at the vehicle. No charge until you approve the price.
      </p>
      <Link className="btn" href="/" style={{ marginTop: 20, display: 'inline-block' }}>BACK TO STORE</Link>
    </div>
  )
}
