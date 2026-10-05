'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoIcon } from '@/components/Logo'

// Operator console. After verifying ownership and confirming a flat price,
// the operator mints a Stripe payment link here for that exact amount and
// sends it to the customer. The amount is set here, never by the browser.
export default function OperatorConsole() {
  const router = useRouter()
  const [ref, setRef] = useState('')
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  const ok = ref.trim() && /.+@.+\..+/.test(email) && Number(amount) > 0

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(''); setLink(''); setCopied(false)
    try {
      const r = await fetch('/api/checkout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim(), email: email.trim(), amount: Number(amount), description: description.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'Could not create the payment link.'); return }
      setLink(d.url)
    } catch {
      setErr('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* noop */ }
  }

  const logout = async () => {
    try { await fetch('/api/operator/login/', { method: 'DELETE' }) } catch { /* noop */ }
    router.replace('/operator/login')
    router.refresh()
  }

  return (
    <main className="wrap" style={{ paddingBlock: '34px 60px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={30} />
          <div>
            <div className="kicker">Operator console</div>
            <h1 style={{ fontSize: 'clamp(1.6rem,3.6vw,2.2rem)', margin: 0 }}>Payment links</h1>
          </div>
        </div>
        <button className="btn ghost sm" onClick={logout}>LOG OUT</button>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2 className="pstep">Charge a confirmed order</h2>
        <p className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12, marginTop: 0 }}>
          Verify ownership and confirm the flat price first. The customer is charged only through the link you send — nothing is charged at the storefront.
        </p>
        <form onSubmit={create}>
          <div className="opt" style={{ marginBottom: 12 }}>
            <label htmlFor="ref">::ORDER REFERENCE</label>
            <input id="ref" className="field" style={{ textTransform: 'none' }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="GCK-XXXXX-XXXX" />
          </div>
          <div className="opt" style={{ marginBottom: 12 }}>
            <label htmlFor="email">::CUSTOMER EMAIL</label>
            <input id="email" className="field" style={{ textTransform: 'none' }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
          </div>
          <div className="opt" style={{ marginBottom: 12 }}>
            <label htmlFor="amount">::CONFIRMED AMOUNT (USD)</label>
            <input id="amount" className="field" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="245.00" />
          </div>
          <div className="opt" style={{ marginBottom: 12 }}>
            <label htmlFor="desc">::DESCRIPTION (OPTIONAL)</label>
            <input id="desc" className="field" style={{ textTransform: 'none' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="2018 Honda Civic · smart key cut + coded" />
          </div>
          <button className="btn glow" type="submit" disabled={!ok || busy}>
            {busy ? 'CREATING…' : 'CREATE PAYMENT LINK'}<span className="arrow" aria-hidden="true">→</span>
          </button>
        </form>
        {err ? <p className="ex" style={{ color: 'var(--alert)', marginTop: 12 }}>{err}</p> : null}
        {link ? (
          <div className="vresult" style={{ marginTop: 16 }}>
            <div style={{ color: 'var(--neon)', letterSpacing: '.18em', fontSize: 11 }}>PAYMENT LINK READY</div>
            <div style={{ wordBreak: 'break-all', margin: '8px 0', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--bright)' }}>{link}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm" onClick={copy}>{copied ? 'COPIED ✓' : 'COPY LINK'}</button>
              <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer">OPEN</a>
            </div>
            <p className="ex" style={{ marginTop: 10 }}>Send this to {email}. They pay the exact confirmed amount on Stripe&apos;s secure page.</p>
          </div>
        ) : null}
      </div>
    </main>
  )
}
