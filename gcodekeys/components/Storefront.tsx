'use client'

import { useEffect, useRef, useState } from 'react'
import { LogoIcon, Wordmark } from './Logo'
import { PRODUCTS, SHELL_COLORS, FINISHES, KEY_TYPES, DROPS } from '@/lib/catalog'

type Finish = (typeof FINISHES)[number]
type KeyType = (typeof KEY_TYPES)[number]

export function Storefront() {
  const [cart, setCart] = useState(0)
  const [toast, setToast] = useState('')
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pop = (msg: string) => {
    setToast(msg)
    if (tRef.current) clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(''), 1400)
  }
  const add = (label: string) => { setCart((c) => c + 1); pop(label) }

  return (
    <>
      <div className="wrap">
        <header className="top">
          <a className="brand" href="#top"><LogoIcon /><Wordmark /></a>
          <nav className="nav">
            <a href="#build">BUILD</a><a href="#shop">SHOP</a>
            <a href="#drops">DROPS</a><a href="#replace">REPLACE</a>
            <a href="/operator/login/">OPERATOR</a>
            <button className="cart" onClick={() => pop(cart ? `CART: ${cart} ITEM${cart > 1 ? 'S' : ''} · EXAMPLE` : 'CART EMPTY')}>
              CART [{cart}]
            </button>
          </nav>
        </header>

        <section className="hero" id="top">
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

        <Configurator onAdd={add} />
        <Shop onAdd={add} />
        <Drops />
        <Replace onAdd={add} />
        <Trust />
      </div>

      <footer>
        <div className="wrap">
          <div className="brand" style={{ marginBottom: 10 }}><Wordmark /></div>
          <p className="disc">
            Preview build of gcodekeys.com. Products shown are the planned catalog and all prices are <b>examples</b> to set before launch, not live charges. GCode Keys is an independent automotive key service, not a dealer or manufacturer. Keys are programmed at the vehicle after proof of ownership. Coverage is most makes and models; some late-model vehicles are dealer-only and are referred out. Drop timers are illustrative.
          </p>
        </div>
      </footer>

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </>
  )
}

function Configurator({ onAdd }: { onAdd: (m: string) => void }) {
  const [color, setColor] = useState(SHELL_COLORS[0].hex)
  const [finish, setFinish] = useState<Finish>(FINISHES[0])
  const [ktype, setKtype] = useState<KeyType>(KEY_TYPES[0])
  const [engrave, setEngrave] = useState('YOUR NAME')
  const price = ktype.base + finish.premium
  const fobClass = `fob${finish.id === 'gloss' ? '' : ' ' + finish.id}`

  return (
    <section id="build">
      <div className="shead"><div><div className="kicker">Build your fob</div><h2>Make it yours</h2></div></div>
      <div className="config">
        <div className="stage">
          <div className={fobClass} style={{ background: color, ['--shell' as string]: color }}>
            <div className="logo">GCODE</div>
            <div className="screen">{(engrave || 'GCODE').toUpperCase()}</div>
            <div className="btns"><i /><i /><i /><i /></div>
            <div className="blade" />
          </div>
        </div>
        <div className="opts">
          <div className="opt">
            <label>::SHELL COLOR</label>
            <div className="swatches">
              {SHELL_COLORS.map((s) => (
                <button key={s.hex} className="sw" style={{ background: s.hex }} aria-pressed={color === s.hex} aria-label={s.name} onClick={() => setColor(s.hex)} />
              ))}
            </div>
          </div>
          <div className="opt">
            <label>::FINISH</label>
            <div className="segs">
              {FINISHES.map((f) => (
                <button key={f.id} className="seg" aria-pressed={finish.id === f.id} onClick={() => setFinish(f)}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="opt">
            <label htmlFor="engrave">::ENGRAVING (10 CHARS)</label>
            <input id="engrave" className="field" maxLength={10} value={engrave} onChange={(e) => setEngrave(e.target.value)} />
          </div>
          <div className="opt">
            <label>::KEY TYPE</label>
            <div className="segs">
              {KEY_TYPES.map((k) => (
                <button key={k.id} className="seg" aria-pressed={ktype.id === k.id} onClick={() => setKtype(k)}>{k.label}</button>
              ))}
            </div>
          </div>
          <div className="priceline">
            <div><div className="amt">${price}</div><div className="ex">EXAMPLE PRICING · set at launch</div></div>
            <button className="btn" onClick={() => onAdd('CUSTOM FOB ADDED · EXAMPLE')}>ADD TO CART</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Shop({ onAdd }: { onAdd: (m: string) => void }) {
  return (
    <section id="shop">
      <div className="shead"><div><div className="kicker">The shop</div><h2>Keys, covers, and defense</h2></div><a className="btn ghost sm" href="#build">OPEN BUILDER</a></div>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <div className="card" key={p.id}>
            <div className="cat">{p.category}{p.tag ? <> · <span className="chip">{p.tag}</span></> : null}</div>
            <h3>{p.name}</h3>
            <p>{p.blurb}</p>
            <div className="row">
              <span className="p">${p.priceExample}</span>
              <button className="btn sm" onClick={() => onAdd(`${p.name.toUpperCase()} ADDED · EXAMPLE`)}>ADD</button>
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
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
          <div className="drop" key={d.id}>
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

function Replace({ onAdd }: { onAdd: (m: string) => void }) {
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
      <div className="vinbox">
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
            <div style={{ marginTop: 10 }}><button className="btn sm" onClick={() => onAdd('REPLACEMENT KEY ADDED · EXAMPLE')}>BOOK / ORDER →</button></div>
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
      <div className="trust">
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
