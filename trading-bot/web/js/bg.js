/**
 * AMBIENT BACKDROP — the quiet light behind the desk.
 *
 * A handful of large, soft colour fields drift on slow sine paths and are
 * blended additively into a dark base, so the app sits on a living aurora
 * rather than a flat panel. It is deliberately faint: it shows through the
 * page gutters and behind the header and heroes, never over a table.
 *
 * It is pure decoration. It reads no data, fetches nothing, and draws only
 * from constants here. Rules it keeps:
 *   - `prefers-reduced-motion` → one static frame, no animation loop.
 *   - hidden tab or an off switch → the loop stops; a dashboard must not
 *     spin a GPU nobody is looking at.
 *   - every call is wrapped so a browser without canvas simply shows the CSS
 *     base gradient underneath.
 *
 * Turn it off from the console or a bookmarklet with
 * `localStorage.setItem('mrcash-ambient','0')` and reload.
 */
try {
  const cv = document.getElementById('bg')
  if (cv && cv.getContext) {
    const ctx = cv.getContext('2d')
    const off = (() => { try { return localStorage.getItem('mrcash-ambient') === '0' } catch { return false } })()
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    // The fields: fraction-of-viewport home, colour, radius scale, and a slow
    // orbit. PRISM palette: champagne gold, electric cyan, violet and coral —
    // vivid, but none of them emerald or rose, so no field can be read as up
    // or down.
    const ORBS = [
      { x: 0.14, y: 0.06, c: '242,198,109', r: 0.70, ax: 0.05, ay: 0.04, sx: 0.019, sy: 0.015, ph: 0.0, a: 0.10 },
      { x: 0.90, y: 0.12, c: '56,217,232',  r: 0.58, ax: 0.06, ay: 0.05, sx: 0.015, sy: 0.021, ph: 1.7, a: 0.075 },
      { x: 0.80, y: 0.88, c: '167,139,250', r: 0.64, ax: 0.05, ay: 0.06, sx: 0.017, sy: 0.013, ph: 3.1, a: 0.08 },
      { x: 0.18, y: 0.92, c: '255,138,101', r: 0.54, ax: 0.05, ay: 0.05, sx: 0.013, sy: 0.019, ph: 4.6, a: 0.06 },
    ]

    // Smoothness: the fields are soft blurs, so they are drawn at a fraction of
    // screen resolution and stretched by CSS — a full-viewport redraw at device
    // pixels was the single heaviest thing on the page. They also drift slowly
    // enough that ~24 frames a second is indistinguishable from 60.
    const SCALE = 0.35
    const FRAME_MS = 1000 / 24
    let last = -Infinity

    let w = 0, h = 0, dpr = 1, min = 0, raf = null

    function fit() {
      dpr = SCALE
      w = window.innerWidth; h = window.innerHeight; min = Math.max(w, h)
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function frame(t) {
      raf = null
      if (!reduce && t - last < FRAME_MS) { if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame); return }
      last = t
      const sec = t / 1000
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (const o of ORBS) {
        const cx = (o.x + (reduce ? 0 : o.ax * Math.sin(sec * o.sx * 6.283 + o.ph))) * w
        const cy = (o.y + (reduce ? 0 : o.ay * Math.cos(sec * o.sy * 6.283 + o.ph))) * h
        const R = o.r * min
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
        g.addColorStop(0, `rgba(${o.c},${o.a})`)
        g.addColorStop(0.55, `rgba(${o.c},${(o.a * 0.35).toFixed(3)})`)
        g.addColorStop(1, `rgba(${o.c},0)`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!reduce && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }

    function start() { if (off) return; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null } }

    fit()
    if (off) { ctx.clearRect(0, 0, w, h) }
    else if (reduce) { frame(0) }
    else { start() }

    let rz = null
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fit(); if (off) return; reduce ? frame(0) : start() }, 150) })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !reduce) start(); else stop() })
  }
} catch { /* no ambient backdrop; the CSS base gradient stands in */ }

/*
 * AMBIENT FILM — an optional looping video behind everything (web/media/hero.mp4,
 * made with Seedance 2.0). If the file is missing the element removes itself
 * and the drawn light above stands in. Muted, looped, dimmed by CSS; paused
 * when the tab is hidden; never played for reduced motion (the poster shows).
 */
try {
  const off = (() => { try { return localStorage.getItem('mrcash-ambient') === '0' } catch { return false } })()
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!off && document.body) {
    // Ask the server which files exist first, so a missing file is not a console error.
    fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json()).then((cfg) => {
      const m = cfg && cfg.media
      if (!m || (!m.film && !m.poster) || (reduce && !m.poster)) return
      const v = document.createElement('video')
      v.id = 'bg-film'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'
      v.setAttribute('aria-hidden', 'true'); v.setAttribute('muted', ''); v.setAttribute('playsinline', '')
      if (m.poster) v.poster = '/media/hero.jpg'
      document.body.prepend(v)
      requestAnimationFrame(() => document.documentElement.classList.add('has-film'))
      if (m.film && !reduce) {
        v.src = '/media/hero.mp4'
        v.addEventListener('canplay', () => { if (document.visibilityState === 'visible') v.play().catch(() => {}) }, { once: true })
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') v.play().catch(() => {}); else v.pause() })
      }
    }).catch(() => {})
  }
} catch { /* no film; the drawn backdrop stands in */ }
