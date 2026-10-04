/**
 * AMBIENT BACKDROP: the light behind the desk, and it is alive for a reason.
 *
 * Large soft colour fields drift behind the page. They are blended additively
 * on the dark themes and painted gently on the light ones, and they show
 * through the gutters and behind the header, never over a table.
 *
 * What moves, and what it means. Each behaviour reads state the app already
 * shows elsewhere in words, so the light never says anything the page does not:
 *   - THE LEAN. One extra field takes the panel's direction: mint for a long
 *     lean, coral for a short one, nothing when flat. It grows stronger as
 *     agreement rises (from desk.js, 'desk:rendered').
 *   - THE TEMPO. The fields drift faster when the volatility regime is high
 *     and slower when it is calm.
 *   - BLIND MEANS DIM. When the candle feed goes stale the room dims, because
 *     Kestrel cannot see (from overview.js, 'kestrel:state').
 *   - ONE MOVE PER CANDLE. When the engine checks a new closed candle, one soft
 *     wave crosses the room once. It is the kestrel's single drop, never a loop.
 * Changes glide: colours and strengths ease toward their new values over a
 * couple of seconds, so a new reading never flashes.
 *
 * Rules it keeps:
 *   - `prefers-reduced-motion`: still frames only. The tint still follows the
 *     state, but nothing drifts and no wave plays.
 *   - A hidden tab or the off switch stops the loop; a dashboard must not spin
 *     a GPU nobody is looking at.
 *   - Everything is wrapped, so a browser without canvas shows the CSS base.
 *
 * Turn it off with `localStorage.setItem('mrcash-ambient','0')` and reload.
 */
try {
  const cv = document.getElementById('bg')
  if (cv && cv.getContext) {
    const ctx = cv.getContext('2d')
    const off = (() => { try { return localStorage.getItem('mrcash-ambient') === '0' } catch { return false } })()
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    // Base fields: home position (fraction of viewport), colour, radius, orbit
    // and strength. None is emerald or rose, so only the lean field can read
    // as up or down.
    const F = (x, y, c, r, a, ph) => ({ x, y, c, r, a, ph, ax: 0.05 + (ph % 1) * 0.02, ay: 0.04 + ((ph * 3) % 1) * 0.02, sx: 0.013 + (ph % 0.7) * 0.01, sy: 0.015 + ((ph * 2) % 0.6) * 0.01 })
    const PALETTES = {
      // Midnight: an aurora of electric cyan, indigo, magenta and a thread of amber.
      midnight: [F(0.12, 0.05, '56,217,232', 0.66, 0.176, 0.0), F(0.92, 0.10, '99,102,241', 0.62, 0.189, 1.7), F(0.80, 0.90, '217,70,239', 0.60, 0.135, 3.1), F(0.16, 0.94, '251,191,36', 0.50, 0.095, 4.6)],
      // Plum: fuchsia, violet, a warm apricot and a cool cyan edge.
      plum: [F(0.10, 0.06, '232,121,249', 0.64, 0.162, 0.0), F(0.90, 0.12, '139,92,246', 0.62, 0.189, 1.7), F(0.82, 0.88, '251,146,60', 0.54, 0.108, 3.1), F(0.18, 0.92, '34,211,238', 0.50, 0.095, 4.6)],
      // Slate: ice, sky and steel with a breath of lilac.
      slate: [F(0.12, 0.05, '125,211,252', 0.64, 0.149, 0.0), F(0.92, 0.12, '96,165,250', 0.62, 0.162, 1.7), F(0.80, 0.90, '56,189,248', 0.56, 0.108, 3.1), F(0.16, 0.94, '196,181,253', 0.52, 0.095, 4.6)],
      // Onyx: champagne gold, copper, amber and one cold cyan for depth.
      onyx: [F(0.14, 0.06, '242,198,109', 0.68, 0.162, 0.0), F(0.90, 0.12, '56,217,232', 0.56, 0.095, 1.7), F(0.80, 0.88, '234,88,12', 0.60, 0.108, 3.1), F(0.18, 0.92, '251,191,36', 0.52, 0.095, 4.6)],
      // Daylight: brighter and more saturated, so a white page still has colour moving behind it.
      daylight: [F(0.10, 0.04, '251,191,36', 0.62, 0.22, 0.0), F(0.92, 0.10, '34,211,238', 0.56, 0.20, 1.7), F(0.82, 0.90, '139,92,246', 0.62, 0.18, 3.1), F(0.16, 0.94, '249,115,22', 0.52, 0.14, 4.6)],
      // Linen: brass, teal, plum and terracotta, quieter still.
      linen: [F(0.08, 0.04, '179,138,62', 0.62, 0.20, 0.0), F(0.92, 0.10, '21,99,106', 0.56, 0.12, 1.7), F(0.82, 0.90, '106,63,158', 0.62, 0.09, 3.1), F(0.16, 0.94, '156,63,27', 0.52, 0.08, 4.6)],
    }
    const theme = () => document.documentElement.getAttribute('data-theme') || 'linen'
    const light = () => document.documentElement.getAttribute('data-tone') === 'light'
    const pick = () => PALETTES[theme()] || PALETTES.midnight
    let ORBS = pick()

    // State, as last announced by the page, and the eased values actually drawn.
    const want = { lean: 'flat', score: 0, tempo: 1, dim: 1 }
    const now = { leanA: 0, leanC: [255, 255, 255], tempo: 1, dim: 1 }
    let lastTick = null, wave = null
    const LEAN_RGB = () => light() ? { long: [26, 120, 80], short: [175, 45, 62] } : { long: [74, 222, 154], short: [255, 107, 122] }
    const TEMPO = { calm: 0.6, low: 0.6, normal: 1, elevated: 1.4, high: 1.7, extreme: 2 }

    // Soft blurs, so drawn at a fraction of screen resolution and stretched by
    // CSS. They drift slowly enough that ~24 frames a second reads as 60.
    const SCALE = 0.35
    const FRAME_MS = 1000 / 24
    let last = -Infinity, clock = 0, prevT = null
    let w = 0, h = 0, min = 0, raf = null

    function fit() {
      w = window.innerWidth; h = window.innerHeight; min = Math.max(w, h)
      cv.width = Math.round(w * SCALE); cv.height = Math.round(h * SCALE)
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    }

    const ease = (cur, target, k) => cur + (target - cur) * k
    const strike = (p) => 1 - Math.pow(1 - p, 3) // fast, decided, no overshoot

    function blob(cx, cy, R, rgb, a) {
      if (a <= 0.002) return
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`)
      g.addColorStop(0.55, `rgba(${rgb},${(a * 0.35).toFixed(3)})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill()
    }

    function frame(t) {
      raf = null
      if (!reduce && t - last < FRAME_MS) { if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame); return }
      const dt = prevT === null ? 0 : Math.min(0.25, (t - prevT) / 1000)
      prevT = t; last = t

      // Ease toward the announced state (about two seconds to settle); jump when still.
      const k = reduce ? 1 : Math.min(1, dt * 1.6)
      const leanRgb = LEAN_RGB()[want.lean]
      const targetA = leanRgb ? (light() ? 0.12 : 0.20) * (0.25 + 0.75 * Math.min(1, Math.max(0, want.score) / 100)) : 0
      now.leanA = ease(now.leanA, targetA, k)
      if (leanRgb) now.leanC = now.leanC.map((c, i) => ease(c, leanRgb[i], k))
      now.tempo = ease(now.tempo, want.tempo, k)
      now.dim = ease(now.dim, want.dim, k)
      clock += dt * now.tempo

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = light() ? 'source-over' : 'lighter'
      for (const o of ORBS) {
        const cx = (o.x + (reduce ? 0 : o.ax * Math.sin(clock * o.sx * 6.283 + o.ph))) * w
        const cy = (o.y + (reduce ? 0 : o.ay * Math.cos(clock * o.sy * 6.283 + o.ph))) * h
        blob(cx, cy, o.r * min, o.c, o.a * now.dim)
      }
      // The lean: behind the core, mid-page, so it shows through the gutters and the core's glass.
      blob((0.5 + (reduce ? 0 : 0.05 * Math.sin(clock * 0.09))) * w, (0.42 + (reduce ? 0 : 0.03 * Math.cos(clock * 0.07))) * h, 0.78 * min, now.leanC.map(Math.round).join(','), now.leanA * now.dim)

      // One wave per new candle: a soft ring that crosses the room once.
      if (wave && !reduce) {
        const p = (t - wave.t0) / 1800
        if (p >= 1) wave = null
        else {
          const R = strike(p) * 1.25 * min, band = 0.18 * min
          const a = (light() ? 0.07 : 0.10) * (1 - p) * now.dim
          const rgb = leanRgb ? now.leanC.map(Math.round).join(',') : (light() ? '30,90,85' : '170,195,255')
          const g = ctx.createRadialGradient(w / 2, 0.42 * h, Math.max(0, R - band), w / 2, 0.42 * h, R + band)
          g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`)
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!reduce && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }

    function start() { if (off) return; if (raf) cancelAnimationFrame(raf); prevT = null; raf = requestAnimationFrame(frame) }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null } }
    const redraw = () => { if (off) return; reduce ? frame(performance.now()) : start() }

    fit()
    if (off) ctx.clearRect(0, 0, w, h)
    else redraw()

    let rz = null
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fit(); redraw() }, 150) })
    document.addEventListener('theme:change', () => { ORBS = pick(); redraw() })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !reduce) start(); else stop() })

    // The panel's lean and the volatility regime, from the desk.
    document.addEventListener('desk:rendered', (e) => {
      const d = e.detail || {}
      want.lean = d.direction === 'long' || d.direction === 'short' ? d.direction : 'flat'
      want.score = typeof d.score === 'number' ? d.score : 0
      want.tempo = TEMPO[String(d.volatility || 'normal').toLowerCase()] ?? 1
      if (reduce) redraw()
    })
    // Data freshness and each new candle check, from the Home overview.
    document.addEventListener('kestrel:state', (e) => {
      const d = e.detail || {}
      want.dim = d.stale ? 0.45 : 1
      if (typeof d.tick === 'number') {
        if (lastTick !== null && d.tick > lastTick && !reduce) wave = { t0: performance.now() }
        lastTick = d.tick
      }
      if (reduce) redraw()
    })
  }
} catch { /* no ambient backdrop; the CSS base gradient stands in */ }

/*
 * AMBIENT FILM: an optional looping video behind everything (web/media/hero.mp4,
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
