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
    // orbit. Colours are the brand mint and lime plus a cool teal and a violet
    // for depth — the same family as the accent, never a clashing hue.
    const ORBS = [
      { x: 0.14, y: 0.10, c: '34,211,238',  r: 0.66, ax: 0.06, ay: 0.05, sx: 0.021, sy: 0.017, ph: 0.0, a: 0.13 },
      { x: 0.86, y: 0.16, c: '139,124,246', r: 0.58, ax: 0.07, ay: 0.05, sx: 0.017, sy: 0.023, ph: 1.7, a: 0.12 },
      { x: 0.80, y: 0.84, c: '52,211,153',  r: 0.62, ax: 0.06, ay: 0.06, sx: 0.019, sy: 0.015, ph: 3.1, a: 0.11 },
      { x: 0.22, y: 0.88, c: '236,72,153',  r: 0.52, ax: 0.05, ay: 0.06, sx: 0.015, sy: 0.021, ph: 4.6, a: 0.08 },
      { x: 0.52, y: 0.44, c: '34,211,238',  r: 0.48, ax: 0.08, ay: 0.05, sx: 0.013, sy: 0.019, ph: 2.3, a: 0.07 },
      { x: 0.50, y: 0.02, c: '163,230,53',  r: 0.40, ax: 0.05, ay: 0.04, sx: 0.016, sy: 0.014, ph: 5.2, a: 0.06 },
    ]

    let w = 0, h = 0, dpr = 1, min = 0, raf = null

    function fit() {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = window.innerWidth; h = window.innerHeight; min = Math.max(w, h)
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function frame(t) {
      raf = null
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
