import type { Metadata } from 'next'
import { LogoIcon } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Operator access — GCode Keys',
  robots: { index: false, follow: false },
}

// Operator console entry. The real auth (password check + signed session
// cookie, ownership-record access) is wired before launch; this is the themed
// shell so the door exists. OPERATOR_PASSWORD is set in Vercel, never here.
export default function OperatorLogin() {
  return (
    <section className="cyber-login">
      <form className="cyber-card">
        <p className="cyber-eyebrow"><span style={{ color: 'var(--neon)' }}>●</span> GCODE KEYS // SECURE NODE</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={34} />
          <h1 className="cyber-title" style={{ fontSize: '2.1rem', margin: 0 }}>ACCESS</h1>
        </div>
        <p className="cyber-sub">Operator authentication required</p>
        <div className="opt">
          <label htmlFor="pw" className="cyber-eyebrow">::PASSKEY</label>
          <input id="pw" className="field" type="password" placeholder="••••••••••••" aria-label="Operator password" />
        </div>
        <button className="btn" type="submit" style={{ textAlign: 'center' }}>JACK IN</button>
        <p className="cyber-sub" style={{ opacity: 0.7 }}>Auth is finalized before launch. This is the themed entry point.</p>
      </form>
    </section>
  )
}
