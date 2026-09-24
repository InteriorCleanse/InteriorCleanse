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
    // orbit. Colours stay in the Night Lab family: the iris accent, a little
    // aqua and two deep blues — no hue that could be read as up or down.
    const ORBS = [
      { x: 0.16, y: 0.08, c: '139,147,255', r: 0.70, ax: 0.05, ay: 0.04, sx: 0.019, sy: 0.015, ph: 0.0, a: 0.10 },
      { x: 0.88, y: 0.14, c: '92,225,230',  r: 0.56, ax: 0.06, ay: 0.05, sx: 0.015, sy: 0.021, ph: 1.7, a: 0.06 },
      { x: 0.78, y: 0.86, c: '96,108,255',  r: 0.64, ax: 0.05, ay: 0.06, sx: 0.017, sy: 0.013, ph: 3.1, a: 0.07 },
      { x: 0.20, y: 0.90, c: '70,86,190',   r: 0.54, ax: 0.05, ay: 0.05, sx: 0.013, sy: 0.019, ph: 4.6, a: 0.06 },
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
