'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Cyberpunk / matrix themed admin login.
 *
 * The authentication flow is unchanged: this still POSTs { password } to
 * /api/admin/login/ and, on success, redirects to /admin. Everything new here
 * is presentation — a matrix rain canvas, a neon terminal card, glitch text —
 * all scoped under .cyber-login so it cannot affect the rest of the site.
 */
export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Matrix rain. Pure decoration; it tears down cleanly and sits still when the
  // viewer prefers reduced motion.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const glyphs =
      'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789:.=*+-<>¦'.split('')
    const fontSize = 16
    let columns = 0
    let drops: number[] = []
    let width = 0
    let height = 0

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      columns = Math.floor(width / fontSize)
      drops = new Array(columns).fill(0).map(() => Math.random() * -50)
    }
    resize()

    const draw = () => {
      ctx.fillStyle = 'rgba(2, 6, 4, 0.08)'
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${fontSize}px monospace`
      for (let i = 0; i < drops.length; i++) {
        const char = glyphs[Math.floor(Math.random() * glyphs.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        // Lead glyph bright, trail green.
        ctx.fillStyle = Math.random() > 0.975 ? '#d7fff0' : '#15e37a'
        ctx.fillText(char, x, y)
        if (y > height && Math.random() > 0.975) drops[i] = 0
        drops[i] += 1
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 55) return // ~18fps, easy on the GPU
      last = t
      draw()
    }

    if (reduced) {
      // One static frame instead of an animation.
      ctx.fillStyle = '#020604'
      ctx.fillRect(0, 0, width, height)
      draw()
    } else {
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const res = await fetch('/api/admin/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'ACCESS DENIED')
        return
      }
      router.push('/admin')
      router.refresh()
    } catch {
      setError('LINK SEVERED — NODE UNREACHABLE')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cyber-login">
      <canvas ref={canvasRef} className="cyber-rain" aria-hidden="true" />
      <div className="cyber-scanlines" aria-hidden="true" />
      <div className="cyber-vignette" aria-hidden="true" />

      <form className="cyber-card" onSubmit={submit}>
        <div className="cyber-card-glow" aria-hidden="true" />

        <p className="cyber-eyebrow">
          <span className="cyber-dot" /> INTERIORCLEANSE // SECURE NODE
        </p>

        <h1 className="cyber-title" data-text="ACCESS">
          ACCESS
        </h1>

        <p className="cyber-sub">OPERATOR AUTHENTICATION REQUIRED</p>

        <label className="cyber-field">
          <span className="cyber-field-label">::PASSKEY</span>
          <input
            className="cyber-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            aria-label="Admin password"
            autoFocus
          />
          <span className="cyber-caret" aria-hidden="true" />
        </label>

        {error ? (
          <p className="cyber-error" role="alert">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        ) : null}

        <button className="cyber-submit" type="submit" disabled={busy}>
          <span className="cyber-submit-label">
            {busy ? 'DECRYPTING…' : 'JACK IN'}
          </span>
          <span className="cyber-submit-sheen" aria-hidden="true" />
        </button>

        <p className="cyber-foot" aria-hidden="true">
          <span>SYS/OK</span>
          <span className="cyber-blink">● LINK LIVE</span>
          <span>ENC/AES</span>
        </p>
      </form>
    </section>
  )
}
