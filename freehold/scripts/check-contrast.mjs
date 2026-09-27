// Checks every text/background pair in the Freehold palette against WCAG AA.
const light = { deed: '#f4efe4', paper: '#fbf8f1', vault: '#0e1524', stone: '#5b5f6b', seal: '#7c2d2d' }
const dark = { deed: '#0e1524', paper: '#151d2e', vault: '#f4efe4', stone: '#a9aeba', seal: '#d0716b' }
const lum = (hex) => {
  const c = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
let fail = 0
for (const [mode, p] of [['light', light], ['dark', dark]]) {
  for (const bg of ['deed', 'paper']) for (const fg of ['vault', 'stone', 'seal']) {
    const r = ratio(p[fg], p[bg]); const ok = r >= 4.5
    if (!ok) fail++
    console.log(`${mode} ${fg} on ${bg}: ${r.toFixed(2)}:1 ${ok ? 'pass' : 'FAIL'}`)
  }
  const r = ratio(p.deed, p.seal); console.log(`${mode} deed text on seal button: ${r.toFixed(2)}:1 ${r >= 4.5 ? 'pass' : 'FAIL'}`); if (r < 4.5) fail++
}
process.exit(fail ? 1 : 0)
