// Checks every text/background pair in the Freehold palette against WCAG AA.
const light = { paper: '#f2f3f0', plate: '#e9ebe6', graphite: '#15171c', stone: '#5c616b', ink: '#1e3fae' }
const dark = { paper: '#0f1115', plate: '#171a20', graphite: '#ecede9', stone: '#a2a7b1', ink: '#8aa4ff' }
const lum = (hex) => {
  const c = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
let fail = 0
const check = (label, fg, bg) => { const r = ratio(fg, bg); const ok = r >= 4.5; if (!ok) fail++; console.log(`${label}: ${r.toFixed(2)}:1 ${ok ? 'pass' : 'FAIL'}`) }
for (const [mode, p] of [['light', light], ['dark', dark]]) {
  for (const bg of ['paper', 'plate']) for (const fg of ['graphite', 'stone', 'ink']) check(`${mode} ${fg} on ${bg}`, p[fg], p[bg])
  check(`${mode} paper text on graphite button`, p.paper, p.graphite)
  check(`${mode} paper text on ink button`, p.paper, p.ink)
}
process.exit(fail ? 1 : 0)
