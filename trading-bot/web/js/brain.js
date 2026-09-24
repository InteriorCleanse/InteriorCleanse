/**
 * THE BRAIN — every model Mr. Cash runs, drawn as one thinking brain.
 *
 * What is real and what is dressing:
 *
 *   REAL — one neuron per strategy inside the brain, coloured by its
 *   vote on this candle (mint BUY, coral SELL, iris HOLD) and sized by its
 *   confidence; a strategy the current regime switches off is drawn hollow and
 *   sends nothing. One input node per desk agent around the outside, coloured
 *   by what it can see (aqua reading, amber estimating, iris standing by, grey
 *   dashed when it cannot see). The core in the middle is the fused decision:
 *   its colour is the fused direction, the arc round it is the agreement score
 *   and the tick is where the panel acts.
 *
 *   MOTION — a pulse is a reading or a vote travelling to the core. Only a
 *   model that is actually reporting sends one; a blind agent and a switched-off
 *   strategy send none. Pulse speed follows the strategy's confidence or the
 *   agent's state. The rhythm itself is not a measurement of anything — it
 *   shows who is talking, not how often the market ticks.
 *
 *   DRESSING — the outline, the folds, the cerebellum and stem, the dust and the slow
 *   wave that crosses the brain. They carry no data.
 *
 * This file only draws. It fetches nothing, owns no timer and holds no
 * thresholds: desk.js hands it the payload's own numbers and runs the frame
 * loop (and stops it off screen and under reduced motion). Every "random"
 * position comes from a seeded generator, so the same payload always draws the
 * same brain.
 */
(() => {
  const C = { iris: '139,147,255', aqua: '92,225,230', mint: '74,222,154', coral: '255,107,122', amber: '255,192,97', grey: '112,121,156', text: '238,241,251', dim: '154,163,194' }
  const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
  const AGENT_STATE = {
    LIVE: { col: C.aqua, label: 'reading', speed: 0.42, n: 2, alpha: 1 },
    PARTIAL: { col: C.amber, label: 'estimating', speed: 0.3, n: 1, alpha: 0.9 },
    WAITING: { col: C.iris, label: 'standing by', speed: 0.17, n: 1, alpha: 0.6 },
    BLIND: { col: C.grey, label: "can't see", speed: 0, n: 0, alpha: 0.5 },
  }

  function seeded(seed) {
    let s = seed >>> 0
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  }
  const frac = (x) => x - Math.floor(x)
  const quad = (p0, p1, p2, s) => {
    const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s
    return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y }
  }
  const shortName = (n) => String(n).replace(/\s*\(.*\)\s*$/, '')

  /* ---------- geometry: a brain seen from the side, front to the left ---------- */
  // The outline in normalised coordinates: a radius multiplier by angle, with
  // two small harmonics for the folds of the edge and a notch low at the front
  // where the temporal lobe tucks under. inside() and the path use the same
  // function, so the dust and the folds never spill over the edge.
  const edge = (th) => 1 + 0.024 * Math.sin(9 * th) + 0.014 * Math.sin(15 * th + 1) - 0.1 * Math.exp(-Math.pow((th - 0.62 * Math.PI) / 0.16, 2))
  const flat = (Y) => (Y > 0 ? 0.8 : 1)

  function brainShape(g) {
    const p = new Path2D()
    for (let k = 0; k <= 140; k++) {
      const th = (k / 140) * Math.PI * 2
      const X = Math.cos(th) * edge(th), Y = Math.sin(th) * edge(th)
      const x = g.bx + g.rx * X, y = g.by + g.ry * Y * flat(Y)
      k ? p.lineTo(x, y) : p.moveTo(x, y)
    }
    p.closePath()
    return p
  }
  function inside(g, x, y, margin = 1) {
    const X = (x - g.bx) / g.rx
    let Y = (y - g.by) / g.ry
    Y = Y / flat(Y)
    return Math.hypot(X, Y) < edge(Math.atan2(Y, X)) * margin
  }

  function layout(w, h, agents, votes) {
    const wide = w / h >= 1.7
    const cx = w / 2
    let R, by
    if (wide) {
      R = Math.max(60, Math.min(h * 0.4, (w / 2 - 182) / 1.25))
      by = h * 0.44
    } else {
      R = Math.max(60, Math.min(w * 0.3, (h - 150) / 2.15))
      by = 34 + 40 + R
    }
    const g = { w, h, wide, cx, R, bx: cx, by, rx: R * 1.25, ry: R }
    g.path = brainShape(g)
    g.cerebellum = { x: cx + g.rx * 0.5, y: by + R * 0.66, rx: g.rx * 0.34, ry: R * 0.25 }
    g.stem = { x: cx + g.rx * 0.18, y: by + R * 0.56, w: g.rx * 0.14, len: R * 0.52 }
    g.core = { x: cx - g.rx * 0.02, y: by + R * 0.04 }

    // Strategy neurons: a loose ring round the core, alternating depth so the
    // network has layers, the same place every time for a given order of ids.
    const n = votes.length
    g.neurons = votes.map((v, i) => {
      const th = -Math.PI / 2 + ((i + 0.5) / Math.max(1, n)) * Math.PI * 2
      const rr = i % 2 ? 0.5 : 0.76
      let X = Math.cos(th) * rr, Y = Math.sin(th) * rr
      Y = Y * flat(Y)
      return { v, x: g.bx + g.rx * X * 0.94, y: g.by + g.ry * Y }
    })
    for (const a of g.neurons) {
      a.via = { x: (a.x + g.core.x) / 2 + (a.y - g.core.y) * 0.12, y: (a.y + g.core.y) / 2 - (a.x - g.core.x) * 0.12 }
      a.near = g.neurons.filter((b) => b !== a).sort((b, c) => Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(c.x - a.x, c.y - a.y)).slice(0, 2)
    }

    // Desk agents: inputs round the outside — front and back on a wide stage,
    // above and below on a narrow one.
    const half = Math.ceil(agents.length / 2)
    g.inputs = agents.map((a, i) => {
      const first = i < half, k = first ? i : i - half, m = first ? half : agents.length - half
      const t = m === 1 ? 0.5 : k / (m - 1)
      if (wide) {
        const side = first ? -1 : 1
        return { a, side, wide, x: cx + side * (g.rx + 44), y: by + R * (-0.62 + 1.3 * t) }
      }
      return { a, side: first ? -1 : 1, wide, x: w * (0.18 + 0.64 * t), y: first ? 40 : by + R * 1.1 + 40 }
    })
    for (const n2 of g.inputs) {
      n2.via = n2.wide
        ? { x: g.bx + n2.side * g.rx * 0.78, y: (n2.y * 0.6 + g.core.y * 0.4) }
        : { x: (n2.x * 0.6 + g.core.x * 0.4), y: g.by + n2.side * g.ry * 0.72 }
    }
    return g
  }

  /* ---------- the texture: drawn once per size, then blitted every frame ---------- */
  function texture(g, dpr) {
    const cv = document.createElement('canvas')
    cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr)
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const rnd = seeded(20260924)

    // Brain stem and cerebellum sit behind the cerebrum.
    const st = g.stem
    ctx.beginPath()
    ctx.moveTo(st.x - st.w / 2, st.y); ctx.quadraticCurveTo(st.x - st.w * 0.2, st.y + st.len * 0.6, st.x - st.w * 0.05, st.y + st.len)
    ctx.lineTo(st.x + st.w * 0.45, st.y + st.len); ctx.quadraticCurveTo(st.x + st.w * 0.5, st.y + st.len * 0.5, st.x + st.w / 2, st.y)
    ctx.closePath()
    ctx.fillStyle = `rgba(${C.iris},0.07)`; ctx.fill(); ctx.strokeStyle = `rgba(${C.iris},0.35)`; ctx.lineWidth = 1.1; ctx.stroke()
    const cb = g.cerebellum
    const cbp = new Path2D(); cbp.ellipse(cb.x, cb.y, cb.rx, cb.ry, -0.12, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${C.iris},0.08)`; ctx.fill(cbp)
    ctx.save(); ctx.clip(cbp); ctx.lineWidth = 1
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath(); ctx.ellipse(cb.x - cb.rx * 0.2, cb.y + k * cb.ry * 0.17, cb.rx * 1.1, cb.ry * 0.5, -0.12, Math.PI * 1.05, Math.PI * 1.95)
      ctx.strokeStyle = `rgba(${C.iris},0.2)`; ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = `rgba(${C.iris},0.4)`; ctx.lineWidth = 1.2; ctx.stroke(cbp)

    // Cerebrum body: a soft lit volume, brightest a little above the core.
    const body = ctx.createRadialGradient(g.core.x - g.rx * 0.2, g.core.y - g.ry * 0.35, g.R * 0.1, g.bx, g.by, g.rx * 1.05)
    body.addColorStop(0, `rgba(${C.iris},0.2)`); body.addColorStop(0.55, `rgba(${C.iris},0.08)`); body.addColorStop(1, `rgba(${C.iris},0.03)`)
    ctx.fillStyle = `rgba(9,12,26,0.92)`; ctx.fill(g.path)
    ctx.fillStyle = body; ctx.fill(g.path)

    // Folds: meandering grooves, each with a darker shadow line beside it.
    ctx.save(); ctx.clip(g.path)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const folds = Math.round((g.rx * g.ry) / 520)
    for (let i = 0; i < folds; i++) {
      let x, y, tries = 0
      do { x = g.bx + (rnd() * 2 - 1) * g.rx; y = g.by + (rnd() * 2 - 1) * g.ry } while (!inside(g, x, y, 0.97) && ++tries < 20)
      let ang = rnd() * Math.PI * 2
      const steps = 14 + Math.floor(rnd() * 22), turn = (rnd() - 0.5) * 0.5, ph = rnd() * 6
      const pts = [[x, y]]
      for (let k = 0; k < steps; k++) {
        ang += turn + 0.55 * Math.sin(k * 0.55 + ph)
        x += Math.cos(ang) * 4.2; y += Math.sin(ang) * 4.2
        pts.push([x, y])
      }
      for (const [off, col, lw] of [[1.2, 'rgba(3,5,12,0.32)', 1.8], [0, `rgba(${C.iris},${(0.16 + rnd() * 0.12).toFixed(3)})`, 1.15]]) {
        ctx.beginPath()
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + off, py + off) : ctx.moveTo(px + off, py + off)))
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke()
      }
    }
    // The two landmark grooves: the central sulcus from the crown down, and the
    // lateral one running back from the notch low at the front.
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(${C.iris},0.34)`
    ctx.beginPath(); ctx.moveTo(g.bx + g.rx * 0.05, g.by - g.ry * 0.98)
    ctx.bezierCurveTo(g.bx - g.rx * 0.08, g.by - g.ry * 0.6, g.bx + g.rx * 0.12, g.by - g.ry * 0.35, g.bx - g.rx * 0.02, g.by + g.ry * 0.05); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(g.bx - g.rx * 0.5, g.by + g.ry * 0.6)
    ctx.bezierCurveTo(g.bx - g.rx * 0.2, g.by + g.ry * 0.3, g.bx + g.rx * 0.2, g.by + g.ry * 0.28, g.bx + g.rx * 0.55, g.by + g.ry * 0.12); ctx.stroke()
    // Dust: tiny cells.
    const dust = Math.round((g.rx * g.ry) / 36)
    for (let i = 0; i < dust; i++) {
      const x = g.bx + (rnd() * 2 - 1) * g.rx, y = g.by + (rnd() * 2 - 1) * g.ry
      const a = 0.06 + rnd() * 0.3, sz = 0.6 + rnd() * 1.1
      ctx.fillStyle = `rgba(${rnd() > 0.8 ? C.aqua : C.iris},${a.toFixed(3)})`
      ctx.fillRect(x, y, sz, sz)
    }
    ctx.restore()
    // Outline: a soft halo and a crisp edge.
    ctx.strokeStyle = `rgba(${C.iris},0.14)`; ctx.lineWidth = 8; ctx.stroke(g.path)
    ctx.strokeStyle = `rgba(${C.iris},0.6)`; ctx.lineWidth = 1.4; ctx.stroke(g.path)
    return cv
  }

  let cache = { key: '', g: null, tex: null }

  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = cv.clientWidth, h = cv.clientHeight
    if (!w || !h) return null
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ctx, w, h, dpr }
  }

  /* ---------- one frame ---------- */
  function draw(cv, st, tMs, reduced) {
    const f = fit(cv); if (!f) return
    const { ctx, w, h, dpr } = f
    const key = `${w}x${h}x${dpr}|${st.agents.map((a) => a.id).join(',')}|${st.votes.map((v) => v.id).join(',')}`
    if (cache.key !== key) { const g = layout(w, h, st.agents, st.votes); cache = { key, g, tex: texture(g, dpr) } }
    const g = cache.g
    const sec = tMs / 1000
    const dirCol = st.core.direction === 'long' ? C.mint : st.core.direction === 'short' ? C.coral : C.iris

    ctx.clearRect(0, 0, w, h)
    // Ambient light behind the brain, in the decision's colour.
    const bloom = ctx.createRadialGradient(g.core.x, g.core.y, 0, g.core.x, g.core.y, g.rx * 1.5)
    bloom.addColorStop(0, `rgba(${dirCol},0.14)`); bloom.addColorStop(0.5, `rgba(${C.iris},0.05)`); bloom.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(cache.tex, 0, 0, w, h)

    // The thinking wave: a slow ring of light crossing the brain from the core.
    if (!reduced) {
      const period = 4.8, ph = frac(sec / period)
      const r = ph * g.rx * 1.2
      ctx.save()
      ctx.clip(g.path)
      ctx.globalCompositeOperation = 'lighter'
      const ring = ctx.createRadialGradient(g.core.x, g.core.y, Math.max(0, r - 26), g.core.x, g.core.y, r + 2)
      ring.addColorStop(0, `rgba(${C.aqua},0)`); ring.addColorStop(0.8, `rgba(${C.aqua},${(0.13 * (1 - ph)).toFixed(3)})`); ring.addColorStop(1, `rgba(${C.aqua},0)`)
      ctx.fillStyle = ring; ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'lighter'
    let arrive = 0

    // Mesh: each neuron linked to its two nearest neighbours.
    for (const a of g.neurons) for (const b of a.near) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = `rgba(${C.iris},0.12)`; ctx.lineWidth = 0.9; ctx.stroke()
    }

    // Synapses and pulses: strategies to the core.
    for (const n of g.neurons) {
      const v = n.v, off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = off ? C.grey : v.action === 'BUY' ? C.mint : v.action === 'SELL' ? C.coral : C.iris
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.quadraticCurveTo(n.via.x, n.via.y, g.core.x, g.core.y)
      ctx.strokeStyle = `rgba(${col},${off ? 0.08 : voting ? 0.34 : 0.14})`; ctx.lineWidth = voting ? 1.4 : 0.9; ctx.stroke()
      if (off) continue
      const conf = Math.max(0, Math.min(100, Number(v.confidence) || 0)) / 100
      const speed = voting ? 0.28 + 0.55 * conf : 0.12
      const count = voting ? 1 + Math.round(conf * 2) : 1
      for (let k = 0; k < count; k++) {
        const s = reduced ? (k + 1) / (count + 1) : frac(sec * speed + k / count + frac(n.x * 0.013))
        arrive += s > 0.9 ? (s - 0.9) * (voting ? 6 : 2) : 0
        pulse(ctx, n, g.core, s, col, voting ? 1 : 0.55, voting ? 3.2 : 2.2)
      }
    }

    // Synapses and pulses: desk agents to the core.
    for (const n of g.inputs) {
      const S = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING
      ctx.save()
      if (n.a.status === 'BLIND') ctx.setLineDash([3, 5])
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.quadraticCurveTo(n.via.x, n.via.y, g.core.x, g.core.y)
      ctx.strokeStyle = `rgba(${S.col},${(0.26 * S.alpha).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke()
      ctx.restore()
      for (let k = 0; k < S.n; k++) {
        const s = reduced ? (k + 1) / (S.n + 1) : frac(sec * S.speed + k / S.n + frac(n.y * 0.011))
        arrive += s > 0.9 ? (s - 0.9) * 3 * S.alpha : 0
        pulse(ctx, n, g.core, s, S.col, S.alpha, 3)
      }
    }

    // Neurons.
    for (const n of g.neurons) {
      const v = n.v, off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = off ? C.grey : v.action === 'BUY' ? C.mint : v.action === 'SELL' ? C.coral : C.iris
      const conf = Math.max(0, Math.min(100, Number(v.confidence) || 0)) / 100
      const focus = st.focus === v.id
      const r = (voting ? 4.2 + conf * 4.5 : 3.4) * (focus ? 1.5 : 1)
      if (!off) {
        const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.2)
        halo.addColorStop(0, `rgba(${col},${voting ? 0.5 : 0.26})`); halo.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * 4.2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      if (off) { ctx.strokeStyle = `rgba(${col},0.7)`; ctx.lineWidth = 1.2; ctx.stroke() }
      else { ctx.fillStyle = `rgba(${col},${voting ? 1 : 0.8})`; ctx.fill() }
      if (voting || focus) label(ctx, `${shortName(v.name)}${voting ? ` · ${v.action.toLowerCase()} ${Math.round(conf * 100)}` : off ? ' · off' : ' · hold'}`, n.x, n.y - r - 8, 'center', col, focus || voting)
      ctx.globalCompositeOperation = 'lighter'
    }

    // The core: glow that brightens as pulses land, the agreement arc, the act-at tick.
    ctx.globalCompositeOperation = 'lighter'
    const glow = 0.35 + Math.min(0.45, arrive * 0.12)
    const core = ctx.createRadialGradient(g.core.x, g.core.y, 0, g.core.x, g.core.y, 64)
    core.addColorStop(0, `rgba(${dirCol},${glow.toFixed(3)})`); core.addColorStop(0.4, `rgba(${dirCol},${(glow * 0.35).toFixed(3)})`); core.addColorStop(1, `rgba(${dirCol},0)`)
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(g.core.x, g.core.y, 64, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    const R = 34
    ctx.beginPath(); ctx.arc(g.core.x, g.core.y, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,11,22,0.86)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 4; ctx.stroke()
    if (typeof st.core.score === 'number') {
      const a0 = -Math.PI / 2, frac01 = Math.max(0, Math.min(1, st.core.score / 100))
      ctx.beginPath(); ctx.arc(g.core.x, g.core.y, R, a0, a0 + frac01 * Math.PI * 2)
      ctx.strokeStyle = `rgb(${dirCol})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt'
    }
    // The number itself: how much of the panel agrees, out of 100.
    const prevOp = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'source-over'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = typeof st.core.score === 'number' ? `rgb(${C.text})` : `rgba(${C.dim},0.8)`
    ctx.font = `700 22px ${FONT}`; ctx.fillText(typeof st.core.score === 'number' ? String(st.core.score) : '—', g.core.x, g.core.y - 4)
    ctx.fillStyle = `rgba(${C.dim},0.95)`; ctx.font = `500 10px ${FONT}`; ctx.fillText('agree', g.core.x, g.core.y + 13)
    ctx.globalCompositeOperation = prevOp
    if (typeof st.core.enterScore === 'number') {
      const a = -Math.PI / 2 + Math.max(0, Math.min(1, st.core.enterScore / 100)) * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(g.core.x + Math.cos(a) * (R - 7), g.core.y + Math.sin(a) * (R - 7)); ctx.lineTo(g.core.x + Math.cos(a) * (R + 7), g.core.y + Math.sin(a) * (R + 7))
      ctx.strokeStyle = `rgba(${C.text},0.9)`; ctx.lineWidth = 2; ctx.stroke()
    }

    // Agent nodes and their names.
    for (const n of g.inputs) {
      const S = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING
      const focus = st.focus === n.a.id
      const r = focus ? 11 : 8.5
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(12,16,32,0.95)'; ctx.fill()
      ctx.save(); if (n.a.status === 'BLIND') ctx.setLineDash([2.5, 3])
      ctx.strokeStyle = `rgba(${S.col},${S.alpha})`; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore()
      if (n.a.status !== 'BLIND') { ctx.beginPath(); ctx.arc(n.x, n.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = `rgb(${S.col})`; ctx.fill() }
      if (n.wide) {
        const align = n.side < 0 ? 'right' : 'left', tx = n.x + (n.side < 0 ? -16 : 16)
        text(ctx, n.a.title, tx, n.y - 2, align, `rgb(${C.text})`, `600 13px ${FONT}`)
        text(ctx, S.label, tx, n.y + 14, align, `rgba(${S.col},${Math.max(0.75, S.alpha)})`, `500 11.5px ${FONT}`)
      } else {
        const above = n.side < 0
        text(ctx, n.a.title, n.x, above ? n.y - 26 : n.y + 24, 'center', `rgb(${C.text})`, `600 12px ${FONT}`)
        text(ctx, S.label, n.x, above ? n.y - 13 : n.y + 37, 'center', `rgba(${S.col},${Math.max(0.75, S.alpha)})`, `500 11px ${FONT}`)
      }
    }
  }

  function pulse(ctx, n, core, s, col, alpha, size) {
    // A comet: a bright head and a short fading tail along the synapse.
    for (let i = 5; i >= 0; i--) {
      const ss = s - i * 0.022
      if (ss < 0) continue
      const p = quad(n, n.via, core, ss)
      const a = alpha * (1 - i / 6) * (ss < 0.08 ? ss / 0.08 : 1)
      ctx.beginPath(); ctx.arc(p.x, p.y, size * (1 - i / 9), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${col},${(0.85 * a).toFixed(3)})`; ctx.fill()
    }
    const p = quad(n, n.via, core, s)
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3.2)
    g.addColorStop(0, `rgba(255,255,255,${(0.7 * alpha).toFixed(3)})`); g.addColorStop(0.35, `rgba(${col},${(0.55 * alpha).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, size * 3.2, 0, Math.PI * 2); ctx.fill()
  }

  function text(ctx, s, x, y, align, fill, font) {
    const prev = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(8,11,22,0.7)'; ctx.fillText(s, x + 0.5, y + 1)
    ctx.fillStyle = fill; ctx.fillText(s, x, y)
    ctx.globalCompositeOperation = prev
  }
  function label(ctx, s, x, y, align, col, strong) {
    text(ctx, s, x, y, align, strong ? `rgb(${col})` : `rgba(${C.dim},0.9)`, `${strong ? 600 : 500} 11.5px ${FONT}`)
  }

  window.MrBrain = { draw }
})()
