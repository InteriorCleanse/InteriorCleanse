/**
 * THE CORE — every model Mr. Cash runs, drawn as one reactor.
 *
 * What is real and what is dressing:
 *
 *   REAL — one satellite per strategy, riding the gimbal rings, coloured by
 *   its vote on this candle (mint BUY, coral SELL, iris HOLD) and sized by its
 *   confidence; a strategy the current regime switches off is drawn hollow and
 *   sends nothing. One port per desk agent round the edge, coloured by what it
 *   can see (aqua reading, amber estimating, iris standing by, grey dashed when
 *   it cannot see). The eye in the middle is the fused decision: its number and
 *   arc are the agreement score, the tick is where the panel acts, and the
 *   plasma round it takes the fused direction's colour. The outer gauge repeats
 *   the score and the act-at mark at a size you can read across a room.
 *
 *   MOTION — a pulse is a reading or a vote travelling into the core. Only a
 *   model that is reporting sends one; a blind agent and a switched-off
 *   strategy send none. Pulse speed follows the strategy's confidence or the
 *   agent's state, and the core flares a little as pulses land. The rhythm is
 *   not a measurement of anything: it shows who is talking, not how often the
 *   market ticks.
 *
 *   DRESSING — the plasma filaments and flares, the gimbal's spin, the
 *   accretion disk, the shockwaves, the HUD rings and the radar sweep. They
 *   carry no data.
 *
 * Interaction: drag to turn the gimbal (it keeps a little momentum), point at a
 * satellite or a port to read it, click one to jump to its row in the list.
 * Under reduced motion it stands still and turns only while you drag it.
 *
 * This file only draws. It fetches nothing, owns no timer and holds no
 * thresholds: desk.js hands it the payload's own numbers and runs the frame
 * loop (and stops it off screen and under reduced motion). Every "random"
 * position comes from a seeded generator, so the same payload always draws the
 * same core.
 */
(() => {
  const C = { iris: '222,190,124', aqua: '124,200,196', mint: '96,200,146', coral: '230,116,124', amber: '236,146,82', grey: '128,120,108', text: '244,238,227', dim: '170,160,145', white: '255,250,240', violet: '200,168,224' }
  const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
  const MONO = "'Geist Mono', ui-monospace, monospace"
  const AGENT_STATE = {
    LIVE: { col: C.aqua, label: 'reading', speed: 0.42, n: 2, alpha: 1 },
    PARTIAL: { col: C.amber, label: 'estimating', speed: 0.3, n: 1, alpha: 0.9 },
    WAITING: { col: C.iris, label: 'standing by', speed: 0.17, n: 1, alpha: 0.6 },
    BLIND: { col: C.grey, label: "can't see", speed: 0, n: 0, alpha: 0.5 },
  }
  const CAM = 5 // camera distance in core radii: enough perspective to read as solid
  const PITCH_REST = 0.42
  const AUTO_YAW = 0.1
  const TAU = Math.PI * 2

  function seeded(seed) {
    let s = seed >>> 0
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  }
  const frac = (x) => x - Math.floor(x)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
  const shortName = (n) => String(n).replace(/\s*\(.*\)\s*$/, '')
  const voteCol = (v) => (v.weight === 0 ? C.grey : v.action === 'BUY' ? C.mint : v.action === 'SELL' ? C.coral : C.iris)

  /* ---------- the model, in core units: built once ---------- */
  // Three gimbal rings, each tilted about its own axis and spinning in its own plane.
  const RINGS = [
    { r: 1.0, tiltX: 1.18, tiltZ: 0.0, spin: 0.22 },
    { r: 1.24, tiltX: 0.32, tiltZ: 0.62, spin: -0.15 },
    { r: 1.48, tiltX: -0.78, tiltZ: -0.35, spin: 0.1 },
  ]
  let model = null
  function buildModel() {
    const rnd = seeded(20260924)
    // Corona filaments: arcs of plasma round the eye, each on its own orbit and beat.
    const filaments = Array.from({ length: 96 }, () => ({ r: 0.2 + rnd() * 0.3, a: rnd() * TAU, len: 0.25 + rnd() * 0.9, w: (rnd() - 0.5) * 1.6, f: 0.6 + rnd() * 2.4, ph: rnd() * TAU, width: 0.8 + rnd() * 1.8, hot: rnd() }))
    // Flares: loops that rise off the plasma and fall back.
    const flares = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU + rnd() * 0.5, span: 0.25 + rnd() * 0.3, h: 0.1 + rnd() * 0.16, f: 0.18 + rnd() * 0.3, ph: rnd() }))
    // Accretion disk: particles spiralling in, faster the closer they get.
    const disk = Array.from({ length: 300 }, () => ({ r0: rnd(), a: rnd() * TAU, v: 0.04 + rnd() * 0.06, sz: 0.6 + rnd() * 1.4, hue: rnd() }))
    return { filaments, flares, disk }
  }

  /* ---------- camera: shared across redraws so a refresh never jumps ---------- */
  const cam = { yaw: 0.6, pitch: PITCH_REST, vyaw: 0, dragging: false, lastT: -1 }
  let hover = null
  let hits = []

  // Rotate a point by the camera, then project with perspective.
  function project(p, g) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
    const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy
    const y1 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp
    const d = CAM / (CAM - z2)
    return { x: g.cx + x1 * g.S * d, y: g.cy - y1 * g.S * d, z: z2, d }
  }
  // A point on a ring, at angle u in the ring's own plane.
  function ringPoint(ring, u, spinAngle) {
    const a = u + spinAngle
    let x = Math.cos(a) * ring.r, y = 0, z = Math.sin(a) * ring.r
    // tilt about X, then about Z
    let y2 = y * Math.cos(ring.tiltX) - z * Math.sin(ring.tiltX), z2 = y * Math.sin(ring.tiltX) + z * Math.cos(ring.tiltX)
    const x3 = x * Math.cos(ring.tiltZ) - y2 * Math.sin(ring.tiltZ), y3 = x * Math.sin(ring.tiltZ) + y2 * Math.cos(ring.tiltZ)
    return { x: x3, y: y3, z: z2 }
  }

  /* ---------- screen layout ---------- */
  function layout(w, h, agents) {
    const wide = w / h >= 1.7
    const g = { w, h, wide }
    if (wide) { g.S = Math.max(50, Math.min(h * 0.27, (w / 2 - 200) / 1.7)); g.cx = w / 2; g.cy = h * 0.5 }
    else { g.S = Math.max(50, Math.min(w * 0.27, (h - 170) / 3.4)); g.cx = w / 2; g.cy = h / 2 + 2 }
    const half = Math.ceil(agents.length / 2)
    g.inputs = agents.map((a, i) => {
      const first = i < half, k = first ? i : i - half, m = first ? half : agents.length - half
      const t = m === 1 ? 0.5 : k / (m - 1)
      if (wide) { const side = first ? -1 : 1; return { a, side, wide, x: g.cx + side * (g.S * 1.75 + 60), y: g.cy + g.S * (-0.9 + 1.8 * t) } }
      return { a, side: first ? -1 : 1, wide, x: w * (0.17 + 0.66 * t), y: first ? 40 : h - 44 }
    })
    return g
  }

  let cache = { key: '', g: null }
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = cv.clientWidth, h = cv.clientHeight
    if (!w || !h) return null
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { ctx, w, h }
  }

  /* ---------- one frame ---------- */
  function draw(cv, st, tMs, reduced) {
    const f = fit(cv); if (!f) return
    const { ctx, w, h } = f
    if (!model) model = buildModel()
    const key = `${w}x${h}|${st.agents.map((a) => a.id).join(',')}`
    if (cache.key !== key) cache = { key, g: layout(w, h, st.agents) }
    const g = cache.g
    const sec = reduced ? 3 : tMs / 1000
    const dt = cam.lastT < 0 || tMs < cam.lastT ? 0 : Math.min(0.05, (tMs - cam.lastT) / 1000)
    cam.lastT = tMs
    if (!reduced && !cam.dragging) {
      cam.yaw += (AUTO_YAW * (1 + 0.35 * Math.sin(sec * 0.11)) + cam.vyaw) * dt
      cam.vyaw *= Math.pow(0.06, dt)
      const rest = PITCH_REST + 0.08 * Math.sin(sec * 0.19)
      cam.pitch += (rest - cam.pitch) * (1 - Math.pow(0.4, dt))
    }
    const focus = st.focus || hover
    const dirCol = st.core.direction === 'long' ? C.mint : st.core.direction === 'short' ? C.coral : C.iris
    const O = { x: g.cx, y: g.cy }
    const EYE = 34 // px radius of the eye that holds the number
    const S = g.S

    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'

    // ---- HUD: graduated rings, a slow radar sweep, the outer gauge ----
    const hudR = S * 1.72
    ctx.save()
    ctx.strokeStyle = `rgba(${C.iris},0.10)`; ctx.lineWidth = 1
    for (const k of [0.62, 1.95]) { ctx.beginPath(); ctx.arc(O.x, O.y, S * k, 0, TAU); ctx.stroke() }
    ctx.setLineDash([1, 5]); ctx.beginPath(); ctx.arc(O.x, O.y, S * 2.12, 0, TAU); ctx.stroke(); ctx.setLineDash([])
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * TAU, long = k % 6 === 0
      const r0 = S * 1.95, r1 = r0 + (long ? 9 : 4)
      ctx.strokeStyle = `rgba(${C.iris},${long ? 0.35 : 0.16})`
      ctx.beginPath(); ctx.moveTo(O.x + Math.cos(a) * r0, O.y + Math.sin(a) * r0); ctx.lineTo(O.x + Math.cos(a) * r1, O.y + Math.sin(a) * r1); ctx.stroke()
    }
    if (!reduced && ctx.createConicGradient) {
      const sweep = (sec * 0.35) % TAU
      // The leading edge is bright; the trail fades out behind it.
      const cg = ctx.createConicGradient(sweep, O.x, O.y)
      cg.addColorStop(0, `rgba(${C.aqua},0.11)`); cg.addColorStop(0.004, 'rgba(0,0,0,0)'); cg.addColorStop(0.86, 'rgba(0,0,0,0)'); cg.addColorStop(0.96, `rgba(${C.aqua},0.025)`); cg.addColorStop(1, `rgba(${C.aqua},0.11)`)
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(O.x, O.y, S * 1.95, 0, TAU); ctx.fill()
      ctx.strokeStyle = `rgba(${C.aqua},0.35)`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(O.x + Math.cos(sweep) * S * 0.62, O.y + Math.sin(sweep) * S * 0.62); ctx.lineTo(O.x + Math.cos(sweep) * S * 1.95, O.y + Math.sin(sweep) * S * 1.95); ctx.stroke()
    }
    ctx.restore()
    // The outer gauge: the agreement score, big enough to read across the room.
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.arc(O.x, O.y, hudR, -Math.PI / 2, Math.PI * 1.5); ctx.stroke()
    if (typeof st.core.score === 'number') {
      const f01 = clamp(st.core.score / 100, 0, 1)
      ctx.strokeStyle = `rgba(${dirCol},0.9)`; ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(O.x, O.y, hudR, -Math.PI / 2, -Math.PI / 2 + f01 * TAU); ctx.stroke()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(${dirCol},0.25)`; ctx.lineWidth = 14
      ctx.beginPath(); ctx.arc(O.x, O.y, hudR, -Math.PI / 2, -Math.PI / 2 + f01 * TAU); ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.lineCap = 'butt'
    if (typeof st.core.enterScore === 'number') {
      const a = -Math.PI / 2 + clamp(st.core.enterScore / 100, 0, 1) * TAU
      ctx.strokeStyle = `rgba(${C.text},0.95)`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(O.x + Math.cos(a) * (hudR - 10), O.y + Math.sin(a) * (hudR - 10)); ctx.lineTo(O.x + Math.cos(a) * (hudR + 10), O.y + Math.sin(a) * (hudR + 10)); ctx.stroke()
      text(ctx, `acts at ${st.core.enterScore}`, O.x + Math.cos(a) * (hudR + 22), O.y + Math.sin(a) * (hudR + 22), Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center', `rgba(${C.dim},1)`, `500 11px ${FONT}`)
    }

    // ---- satellites: strategies riding the rings ----
    const byRing = [[], [], []]
    st.votes.forEach((v, i) => byRing[i % 3].push({ v, i }))
    const sats = []
    byRing.forEach((list, ri) => {
      const ring = RINGS[ri], spin = reduced ? 0 : sec * ring.spin
      list.forEach((o, k) => {
        const u = (k / Math.max(1, list.length)) * TAU + ri * 0.7
        const p3 = ringPoint(ring, u, spin)
        sats.push({ ...o, ri, p3, q: project(p3, g) })
      })
    })

    // Pulse bookkeeping: how recently each model's pulse arrived, for the shockwaves.
    const waves = []
    let arrive = 0

    // ---- accretion disk and rings, back halves first ----
    const disk = diskPoints(g, sec, reduced)
    const ringSeg = RINGS.map((ring) => {
      const spin = reduced ? 0 : sec * ring.spin, pts = []
      for (let k = 0; k <= 120; k++) pts.push(project(ringPoint(ring, (k / 120) * TAU, spin), g))
      return pts
    })
    ctx.globalCompositeOperation = 'lighter'
    drawDisk(ctx, disk, false)
    ringSeg.forEach((pts, ri) => drawRing(ctx, pts, ri, false, dirCol, sec))

    // ---- the plasma: glow, corona filaments, flares ----
    const glow = 0.5 + Math.min(0.5, 0)
    const halo = ctx.createRadialGradient(O.x, O.y, EYE * 0.6, O.x, O.y, S * 0.95)
    halo.addColorStop(0, `rgba(${C.white},0.55)`); halo.addColorStop(0.18, `rgba(${dirCol},0.45)`); halo.addColorStop(0.5, `rgba(${dirCol},0.12)`); halo.addColorStop(1, `rgba(${dirCol},0)`)
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(O.x, O.y, S * 0.95, 0, TAU); ctx.fill()
    void glow
    for (const fl of model.filaments) {
      const a0 = fl.a + sec * fl.w * 0.5
      const r = EYE + 4 + fl.r * S * 0.62 * (1 + 0.06 * Math.sin(sec * fl.f + fl.ph))
      const alpha = reduced ? 0.35 : 0.15 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(sec * fl.f + fl.ph), 2)
      const col = fl.hot > 0.8 ? C.white : fl.hot > 0.45 ? dirCol : C.aqua
      ctx.strokeStyle = `rgba(${col},${(alpha * 0.8).toFixed(3)})`; ctx.lineWidth = fl.width
      ctx.beginPath(); ctx.arc(O.x, O.y, r, a0, a0 + fl.len); ctx.stroke()
    }
    for (const fx of model.flares) {
      const life = reduced ? 0.5 : frac(sec * fx.f + fx.ph), lift = Math.sin(Math.PI * life)
      const a = fx.a + (reduced ? 0 : sec * 0.05), r0 = EYE + S * 0.18
      const p0 = { x: O.x + Math.cos(a) * r0, y: O.y + Math.sin(a) * r0 }, p1 = { x: O.x + Math.cos(a + fx.span) * r0, y: O.y + Math.sin(a + fx.span) * r0 }
      const rm = r0 + fx.h * S * 2.2 * lift, am = a + fx.span / 2
      ctx.strokeStyle = `rgba(${dirCol},${(0.5 * lift).toFixed(3)})`; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(O.x + Math.cos(am) * rm, O.y + Math.sin(am) * rm, p1.x, p1.y); ctx.stroke()
    }

    // ---- beams and pulses: satellites and ports into the core ----
    hits = []
    const beam = (from, col, alpha, width, curl) => {
      const mx = (from.x + O.x) / 2, my = (from.y + O.y) / 2, dx = O.x - from.x, dy = O.y - from.y
      const via = { x: mx - dy * curl, y: my + dx * curl }
      return { from, via, to: O, col, alpha, width }
    }
    const at = (b, s) => { const u = (1 - s) * (1 - s), v = 2 * (1 - s) * s, ww = s * s; return { x: u * b.from.x + v * b.via.x + ww * b.to.x, y: u * b.from.y + v * b.via.y + ww * b.to.y } }
    for (const s of sats) {
      const v = s.v, off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = voteCol(v), b = beam(s.q, col, 0, 0, 0.18)
      const depthA = clamp(0.45 + 0.55 * (s.q.z + 1.5) / 3, 0.35, 1)
      ctx.strokeStyle = `rgba(${col},${((off ? 0.05 : voting ? 0.28 : 0.1) * depthA).toFixed(3)})`; ctx.lineWidth = voting ? 1.3 : 0.8
      ctx.beginPath(); ctx.moveTo(b.from.x, b.from.y); ctx.quadraticCurveTo(b.via.x, b.via.y, O.x, O.y); ctx.stroke()
      if (off) continue
      const conf = clamp(Number(v.confidence) || 0, 0, 100) / 100
      const speed = voting ? 0.3 + 0.55 * conf : 0.12, count = voting ? 1 + Math.round(conf * 2) : 1
      for (let k = 0; k < count; k++) {
        const sp = reduced ? (k + 1) / (count + 1) : frac(sec * speed + k / count + s.i * 0.37)
        arrive += sp > 0.9 ? (sp - 0.9) * (voting ? 6 : 2) : 0
        if (voting && !reduced && sp < 0.35) waves.push({ age: sp / speed, col })
        comet(ctx, (ss) => at(b, ss), sp, col, (voting ? 1 : 0.55) * depthA, voting ? 3 : 2)
      }
    }
    for (const n of g.inputs) {
      const S2 = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING
      const b = beam(n, S2.col, 0, 0, n.side * 0.12)
      ctx.save(); if (n.a.status === 'BLIND') ctx.setLineDash([3, 5])
      ctx.strokeStyle = `rgba(${S2.col},${(0.22 * S2.alpha).toFixed(3)})`; ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.quadraticCurveTo(b.via.x, b.via.y, O.x, O.y); ctx.stroke(); ctx.restore()
      for (let k = 0; k < S2.n; k++) {
        const sp = reduced ? (k + 1) / (S2.n + 1) : frac(sec * S2.speed + k / S2.n + frac(n.x * 0.013 + n.y * 0.007))
        arrive += sp > 0.9 ? (sp - 0.9) * 3 * S2.alpha : 0
        comet(ctx, (ss) => at(b, ss), sp, S2.col, S2.alpha, 2.8)
      }
    }

    // ---- shockwaves as votes land ----
    for (const wv of waves) {
      const r = EYE + wv.age * S * 1.4, a = clamp(0.35 * (1 - wv.age / 1.2), 0, 0.35)
      if (a <= 0) continue
      ctx.strokeStyle = `rgba(${wv.col},${a.toFixed(3)})`; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(O.x, O.y, r, 0, TAU); ctx.stroke()
    }

    // ---- front halves of the rings and disk, then the satellites by depth ----
    ringSeg.forEach((pts, ri) => drawRing(ctx, pts, ri, true, dirCol, sec))
    drawDisk(ctx, disk, true)
    sats.sort((a, b) => a.q.z - b.q.z)
    for (const s of sats) {
      const v = s.v, off = v.weight === 0, voting = v.action === 'BUY' || v.action === 'SELL'
      const col = voteCol(v), conf = clamp(Number(v.confidence) || 0, 0, 100) / 100, on = focus === v.id
      const q = s.q, depthA = clamp(0.45 + 0.55 * (q.z + 1.5) / 3, 0.35, 1)
      const r = (voting ? 4 + conf * 4.5 : 3.2) * q.d * (on ? 1.5 : 1)
      ctx.globalCompositeOperation = 'lighter'
      if (!off) {
        const hl = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4.5)
        hl.addColorStop(0, `rgba(${col},${((voting ? 0.55 : 0.25) * depthA).toFixed(3)})`); hl.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(q.x, q.y, r * 4.5, 0, TAU); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      // A satellite is a small diamond: it reads as a machine part, not a planet.
      ctx.beginPath(); ctx.moveTo(q.x, q.y - r * 1.25); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r * 1.25); ctx.lineTo(q.x - r, q.y); ctx.closePath()
      if (off) { ctx.strokeStyle = `rgba(${col},${(0.75 * depthA).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke() }
      else { ctx.fillStyle = `rgba(${col},${((voting ? 1 : 0.8) * depthA).toFixed(3)})`; ctx.fill() }
      if (on) { ctx.beginPath(); ctx.arc(q.x, q.y, r + 6, 0, TAU); ctx.strokeStyle = `rgba(${C.text},0.85)`; ctx.lineWidth = 1.2; ctx.stroke() }
      if ((voting && q.z > -0.4) || on) text(ctx, `${shortName(v.name)}${voting ? ` · ${v.action.toLowerCase()} ${Math.round(conf * 100)}` : off ? ' · off' : ' · hold'}`, q.x, q.y - r - 10, 'center', `rgb(${col})`, `600 11.5px ${FONT}`)
      hits.push({ id: v.id, x: q.x, y: q.y, r: Math.max(9, r + 5), z: q.z, lines: [shortName(v.name), off ? 'switched off in this regime' : voting ? `${v.action.toLowerCase()} · confidence ${Math.round(conf * 100)}` : 'hold · no vote this candle', `regime weight ${Number(v.weight).toFixed(2)}`], col })
    }

    // ---- the eye: the fused decision ----
    ctx.globalCompositeOperation = 'lighter'
    const flare = 0.35 + Math.min(0.5, arrive * 0.12)
    const eg = ctx.createRadialGradient(O.x, O.y, EYE * 0.8, O.x, O.y, EYE * 2.4)
    eg.addColorStop(0, `rgba(${dirCol},${flare.toFixed(3)})`); eg.addColorStop(1, `rgba(${dirCol},0)`)
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(O.x, O.y, EYE * 2.4, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    const lens = ctx.createRadialGradient(O.x - EYE * 0.3, O.y - EYE * 0.35, 2, O.x, O.y, EYE)
    lens.addColorStop(0, 'rgba(34,29,21,0.97)'); lens.addColorStop(1, 'rgba(8,7,5,0.97)')
    ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(O.x, O.y, EYE, 0, TAU); ctx.fill()
    ctx.strokeStyle = `rgba(${dirCol},0.55)`; ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(O.x, O.y, EYE - 4, 0, TAU); ctx.stroke()
    if (typeof st.core.score === 'number') {
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgb(${dirCol})`; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(O.x, O.y, EYE - 4, -Math.PI / 2, -Math.PI / 2 + clamp(st.core.score / 100, 0, 1) * TAU); ctx.stroke(); ctx.lineCap = 'butt'
    }
    if (typeof st.core.enterScore === 'number') {
      const a = -Math.PI / 2 + clamp(st.core.enterScore / 100, 0, 1) * TAU
      ctx.strokeStyle = `rgba(${C.text},0.9)`; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(O.x + Math.cos(a) * (EYE - 9), O.y + Math.sin(a) * (EYE - 9)); ctx.lineTo(O.x + Math.cos(a) * (EYE + 1), O.y + Math.sin(a) * (EYE + 1)); ctx.stroke()
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = typeof st.core.score === 'number' ? `rgb(${C.text})` : `rgba(${C.dim},0.8)`
    ctx.font = `600 21px ${MONO}`; ctx.fillText(typeof st.core.score === 'number' ? String(st.core.score) : '—', O.x, O.y - 4)
    ctx.fillStyle = `rgba(${C.dim},0.95)`; ctx.font = `500 9.5px ${FONT}`; ctx.fillText('AGREE', O.x, O.y + 12)

    // ---- ports: the desk agents ----
    for (const n of g.inputs) {
      const S2 = AGENT_STATE[n.a.status] || AGENT_STATE.WAITING, on = focus === n.a.id
      const r = on ? 11 : 8.5
      // A port is a small hexagon.
      ctx.beginPath()
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; k ? ctx.lineTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r) : ctx.moveTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r) }
      ctx.closePath(); ctx.fillStyle = 'rgba(16,14,11,0.95)'; ctx.fill()
      ctx.save(); if (n.a.status === 'BLIND') ctx.setLineDash([2.5, 3])
      ctx.strokeStyle = `rgba(${S2.col},${S2.alpha})`; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore()
      if (n.a.status !== 'BLIND') { ctx.beginPath(); ctx.arc(n.x, n.y, 3.2, 0, TAU); ctx.fillStyle = `rgb(${S2.col})`; ctx.fill() }
      if (n.wide) {
        const align = n.side < 0 ? 'right' : 'left', tx = n.x + (n.side < 0 ? -16 : 16)
        text(ctx, n.a.title, tx, n.y - 2, align, `rgb(${C.text})`, `600 13px ${FONT}`)
        text(ctx, S2.label, tx, n.y + 14, align, `rgba(${S2.col},${Math.max(0.75, S2.alpha)})`, `500 11.5px ${FONT}`)
      } else {
        const above = n.side < 0
        text(ctx, n.a.title, n.x, above ? n.y - 26 : n.y + 24, 'center', `rgb(${C.text})`, `600 12px ${FONT}`)
        text(ctx, S2.label, n.x, above ? n.y - 13 : n.y + 37, 'center', `rgba(${S2.col},${Math.max(0.75, S2.alpha)})`, `500 11px ${FONT}`)
      }
      hits.push({ id: n.a.id, x: n.x, y: n.y, r: 16, z: 9, lines: [n.a.title, S2.label], col: S2.col })
    }

    const hv = hover && hits.find((x) => x.id === hover)
    if (hv) card(ctx, hv, w, h)
  }

  /* ---------- the accretion disk ---------- */
  function diskPoints(g, sec, reduced) {
    const out = []
    const ring = { r: 1, tiltX: 1.32, tiltZ: 0.12 }
    for (const p of model.disk) {
      // Spiral in: the radius shrinks over the particle's life, then it is reborn at the rim.
      const life = reduced ? p.r0 : frac(p.r0 + sec * p.v)
      const r = 1.75 - life * 1.2
      const a = p.a + (reduced ? 0 : sec * 0.9 / Math.pow(r, 1.5))
      const p3 = ringPoint({ ...ring, r }, a, 0)
      const q = project(p3, g)
      out.push({ q, r, sz: p.sz, hue: p.hue, fade: Math.sin(Math.PI * life) })
    }
    return out
  }
  function drawDisk(ctx, pts, front) {
    for (const p of pts) {
      if ((p.q.z >= 0) !== front) continue
      const inner = clamp((1.75 - p.r) / 1.2, 0, 1)
      const col = p.hue > 0.75 ? C.violet : inner > 0.6 ? C.aqua : C.iris
      const a = clamp((0.35 + 0.65 * inner) * p.fade * clamp(0.55 + 0.45 * (p.q.z + 1.5) / 3, 0.35, 1), 0, 1)
      ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`
      const s = p.sz * p.q.d * 1.35
      ctx.fillRect(p.q.x - s / 2, p.q.y - s / 2, s, s)
    }
  }

  /* ---------- the gimbal rings ---------- */
  function drawRing(ctx, pts, ri, front, dirCol, sec) {
    ctx.lineCap = 'round'
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1]
      if (((a.z + b.z) / 2 >= 0) !== front) continue
      const depth = clamp(0.35 + 0.65 * ((a.z + b.z) / 2 + 1.5) / 3, 0.2, 1)
      // A bright segment runs round each ring, so the spin is visible.
      const run = Math.pow(0.5 + 0.5 * Math.cos((k / (pts.length - 1)) * Math.PI * 2 * 3 - sec * (1.2 + ri * 0.4)), 8)
      ctx.strokeStyle = `rgba(${ri === 1 ? C.aqua : C.iris},${((0.18 + 0.55 * run) * depth).toFixed(3)})`
      ctx.lineWidth = (1.2 + run * 1.6) * a.d
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      // Tick marks every few segments, like graduations machined into the ring.
      if (k % 10 === 0) { ctx.fillStyle = `rgba(${dirCol},${(0.55 * depth).toFixed(3)})`; ctx.fillRect(a.x - 1.2, a.y - 1.2, 2.4, 2.4) }
    }
    ctx.lineCap = 'butt'
  }

  function comet(ctx, at, s, col, alpha, size) {
    for (let i = 5; i >= 1; i--) {
      const ss = s - i * 0.022
      if (ss < 0) continue
      const p = at(ss)
      const a = alpha * (1 - i / 6) * (ss < 0.08 ? ss / 0.08 : 1)
      ctx.beginPath(); ctx.arc(p.x, p.y, size * (1 - i / 9), 0, TAU)
      ctx.fillStyle = `rgba(${col},${(0.8 * a).toFixed(3)})`; ctx.fill()
    }
    const p = at(s), rr = size * 3.2
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr)
    gr.addColorStop(0, `rgba(255,255,255,${(0.7 * alpha).toFixed(3)})`); gr.addColorStop(0.35, `rgba(${col},${(0.55 * alpha).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill()
  }

  function card(ctx, hv, w, h) {
    ctx.globalCompositeOperation = 'source-over'
    const pad = 10, lh = 17
    const width = Math.max(...hv.lines.map((l, i) => { ctx.font = `${i ? 500 : 600} ${i ? 11.5 : 12.5}px ${FONT}`; return ctx.measureText(l).width })) + pad * 2
    const height = hv.lines.length * lh + pad * 2 - 4
    let x = hv.x + 16, y = hv.y - height - 10
    if (x + width > w - 6) x = hv.x - width - 16
    if (y < 6) y = hv.y + 16
    x = clamp(x, 6, w - width - 6); y = clamp(y, 6, h - height - 6)
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, 9); else ctx.rect(x, y, width, height)
    ctx.fillStyle = 'rgba(19,16,12,0.96)'; ctx.fill()
    ctx.strokeStyle = `rgba(${hv.col},0.55)`; ctx.lineWidth = 1; ctx.stroke()
    hv.lines.forEach((l, i) => {
      ctx.font = `${i ? 500 : 600} ${i ? 11.5 : 12.5}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillStyle = i ? `rgba(${C.dim},1)` : `rgb(${C.text})`
      ctx.fillText(l, x + pad, y + pad + 6 + i * lh)
    })
  }

  function text(ctx, s, x, y, align, fill, font) {
    const prev = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(11,10,8,0.8)'; ctx.fillText(s, x + 0.5, y + 1)
    ctx.fillStyle = fill; ctx.fillText(s, x, y)
    ctx.globalCompositeOperation = prev
  }

  /* ---------- touch: drag to turn, point to read, click to jump ---------- */
  function pick(x, y) {
    let best = null
    for (const t of hits) { if (Math.hypot(t.x - x, t.y - y) <= t.r && (!best || t.z > best.z)) best = t }
    return best ? best.id : null
  }
  function attach(cv, opts = {}) {
    if (!cv || cv.dataset.coreAttached) return
    cv.dataset.coreAttached = '1'
    const redraw = () => opts.redraw && opts.redraw()
    const setHover = (id) => {
      if (id === hover) return
      hover = id; cv.style.cursor = id ? 'pointer' : 'grab'
      if (opts.onHover) opts.onHover(id)
      redraw()
    }
    let down = null
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    cv.style.cursor = 'grab'
    cv.addEventListener('pointerdown', (e) => {
      const p = pos(e)
      down = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, t: e.timeStamp, moved: false, id: pick(p.x, p.y) }
      cam.dragging = true; cam.vyaw = 0
      try { cv.setPointerCapture(e.pointerId) } catch { /* capture is a nicety */ }
    })
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e)
      if (!down) { setHover(pick(p.x, p.y)); return }
      const dx = p.x - down.lastX, dy = p.y - down.lastY, dts = Math.max(0.008, (e.timeStamp - down.t) / 1000)
      if (Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 5) { down.moved = true; cv.style.cursor = 'grabbing' }
      if (!down.moved) return
      cam.yaw += dx * 0.009
      cam.pitch = clamp(cam.pitch + dy * 0.006, -0.3, 1.3)
      cam.vyaw = cam.vyaw * 0.5 + ((dx * 0.009) / dts) * 0.5
      down.lastX = p.x; down.lastY = p.y; down.t = e.timeStamp
      redraw()
    })
    const end = (cancelled) => {
      if (!down) return
      const d = down; down = null; cam.dragging = false
      // Let go mid-swipe and it keeps turning a little; a plain click leaves the drift alone.
      cam.vyaw = d.moved && !cancelled ? clamp(cam.vyaw - AUTO_YAW, -4, 4) : 0
      cv.style.cursor = hover ? 'pointer' : 'grab'
      if (!cancelled && !d.moved && d.id && opts.onPick) opts.onPick(d.id)
      redraw()
    }
    cv.addEventListener('pointerup', () => end(false))
    cv.addEventListener('pointercancel', () => end(true))
    cv.addEventListener('pointerleave', () => { if (!down) setHover(null) })
  }

  window.MrCore = { draw, attach }
})()
