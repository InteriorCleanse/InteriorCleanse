'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { useCart } from './CartProvider'
import { KeyStudio } from './KeyStudio'
import { PRODUCTS, DROPS } from '@/lib/catalog'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function Storefront() {
  const { add } = useCart()
  const root = useRef<HTMLDivElement | null>(null)

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Hero: decisive, staggered entrance (energetic ease-out).
      gsap.from('[data-hero] > *', {
        y: 26, autoAlpha: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08, delay: 0.05,
      })
      // Section reveals on scroll.
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 30, autoAlpha: 0, duration: 0.6, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        })
      })
      // Ambient: the fob breathes.
      gsap.to('[data-fob]', { y: -10, rotate: 1.5, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    })
    return () => mm.revert()
  }, { scope: root })

  return (
    <div className="wrap" ref={root}>
      <section className="hero" id="top" data-hero>
        <p className="eyebrow">&gt;_ THE CODE THAT CUTS</p>
        <h1>Custom car keys,<br /><span className="g">cut like code.</span></h1>
        <p className="lede">Build your fob, pick the finish, engrave it, and we cut and code it to your exact vehicle. Replacements, spares, and limited drops. Flat price, shown before you buy.</p>
        <div className="cta">
          <a className="btn" href="#build">BUILD YOUR FOB</a>
          <a className="btn ghost" href="#replace">REPLACE BY VIN</a>
        </div>
        <div className="trustrow">
          <span>Flat price, in writing</span><span>Cut &amp; coded to your VIN</span><span>Ownership verified</span>
        </div>
      </section>

      <KeyStudio />
      <Shop onAdd={add} />
      <Drops />
      <Replace onAdd={add} />
      <Trust />
    </div>
  )
}

function Shop({ onAdd }: { onAdd: ReturnType<typeof useCart>['add'] }) {
  return (
    <section id="shop">
      <div className="shead"><div><div className="kicker">The shop</div><h2>Keys, covers, and defense</h2></div><a className="btn ghost sm" href="#build">OPEN BUILDER</a></div>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <div className="card reveal" key={p.id}>
            <div className="cat">{p.category}{p.tag ? <> · <span className="chip">{p.tag}</span></> : null}</div>
            <h3>{p.name}</h3>
            <p>{p.blurb}</p>
            <div className="row">
              <span className="p">${p.priceExample}</span>
              <button className="btn sm" onClick={() => onAdd({ key: `p-${p.id}`, name: p.name, price: p.priceExample }, `${p.name} added · example`)}>ADD</button>
            </div>
          </div>
        ))}
      </div>
      <p className="ex" style={{ marginTop: 12 }}>EXAMPLE PRICING — real prices are set before launch; nothing here is a live charge.</p>
    </section>
  )
}

function fmt(mins: number) {
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  return `${d ? d + 'd ' : ''}${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
}

function Drops() {
  const [mins, setMins] = useState(DROPS.map((d) => d.minutes))
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const iv = setInterval(() => setMins((xs) => xs.map((m) => Math.max(0, m - 1))), 60000)
    return () => clearInterval(iv)
  }, [])
  const notify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/.+@.+\..+/.test(email)) { setMsg('Enter a valid email.'); return }
    try {
      await fetch('/api/notify/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setMsg("On the list. We'll ping you when drops go live.")
      setEmail('')
    } catch { setMsg('Could not sign you up right now.') }
  }
  return (
    <section id="drops">
      <div className="shead"><div><div className="kicker">Limited</div><h2>This month&apos;s drops</h2></div></div>
      <div className="drops">
        {DROPS.map((d, i) => (
          <div className="drop reveal" key={d.id}>
            <div className="tag">◆ DROP 0{i + 1} · {d.units} UNITS</div>
            <h3>{d.name}</h3>
            <div className="count">{mins[i] ? fmt(mins[i]) : 'LIVE NOW'}</div>
            <div className="clabel">UNTIL LIVE</div>
          </div>
        ))}
      </div>
      <form className="vinrow" style={{ marginTop: 16 }} onSubmit={notify}>
        <input className="field" type="email" placeholder="EMAIL FOR DROP ALERTS" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email for drop alerts" />
        <button className="btn" type="submit">NOTIFY ME</button>
      </form>
      {msg ? <p className="ex" style={{ marginTop: 8, color: 'var(--neon)' }}>{msg}</p> : null}
    </section>
  )
}

type QuoteResult = { vehicle: string; key: string; method: string; priceExample: number | null } | null

function Replace({ onAdd }: { onAdd: ReturnType<typeof useCart>['add'] }) {
  const [vin, setVin] = useState('2018 HONDA CIVIC')
  const [res, setRes] = useState<QuoteResult>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(''); setRes(null)
    try {
      const r = await fetch('/api/quote/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vin }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? 'Could not decode that.'); return }
      setRes(d)
    } catch { setErr('Could not reach the server.') } finally { setBusy(false) }
  }
  return (
    <section id="replace">
      <div className="shead"><div><div className="kicker">Lost or need a spare</div><h2>Replace by VIN or plate</h2></div></div>
      <div className="vinbox reveal">
        <label className="ex" htmlFor="vin" style={{ color: 'var(--neon)', letterSpacing: '.2em' }}>::ENTER VIN OR PLATE</label>
        <form className="vinrow" onSubmit={submit}>
          <input id="vin" className="field" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="1HGCV1F30LA000000" />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'DECODING…' : 'GET FLAT PRICE'}</button>
        </form>
        {err ? <p className="ex" style={{ marginTop: 10, color: 'var(--alert)' }}>{err}</p> : null}
        {res ? (
          <div className="vresult">
            <div>VEHICLE&nbsp; <b>{res.vehicle}</b></div>
            <div>KEY&nbsp; <b>{res.key}</b></div>
            <div>JOB&nbsp; <b>{res.method}</b></div>
            <div style={{ marginTop: 6 }}>FLAT PRICE&nbsp; <span className="amt">{res.priceExample == null ? '$—' : '$' + res.priceExample}</span> &nbsp;·&nbsp; <span style={{ color: 'var(--amber)' }}>EXAMPLE</span></div>
            <div style={{ marginTop: 10 }}>
              <button
                className="btn sm"
                onClick={() => onAdd({ key: `vin-${res.vehicle}`, name: `Replacement key · ${res.vehicle}`, price: res.priceExample ?? 0, meta: res.key }, 'Replacement added · example')}
              >
                ADD TO BAG →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Trust() {
  return (
    <section>
      <div className="shead"><div><div className="kicker">Why GCode</div><h2>Fast. Honest. Verified.</h2></div></div>
      <div className="trust reveal">
        <div className="tbox">
          <div className="n">[✓] THE PROMISE</div>
          <h3>The price you see is the price you pay</h3>
          <div className="vlist">
            <div><i>[✓]</i><span>Flat, all-in pricing in writing before anything ships.</span></div>
            <div><i>[✓]</i><span>Ownership verified at checkout: ID, registration, VIN match.</span></div>
            <div><i>[✓]</i><span>Anti-relay Faraday pouches to stop fob theft in your driveway.</span></div>
          </div>
        </div>
        <div className="tbox alert">
          <div className="n">[!] THE ONE RULE</div>
          <h3>Keys are coded at your vehicle</h3>
          <p>We cut, customize, and ship, and we verify ownership on every order. The final programming happens at the car. No one can safely code a key over the internet, and we won&apos;t pretend otherwise.</p>
        </div>
      </div>
    </section>
  )
}
