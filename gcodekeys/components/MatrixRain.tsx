'use client'

import { useEffect, useRef } from 'react'

// Ambient matrix rain. Decoration only; still when reduced motion is preferred.
export function MatrixRain() {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const x = c.getContext('2d')
    if (!x) return
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾅﾆﾇﾈﾉ0123456789:.=*+<>'.split('')
    const fs = 16
    let W = 0, H = 0, drops: number[] = []
    const size = () => {
      W = c.width = window.innerWidth
      H = c.height = window.innerHeight
      drops = new Array(Math.floor(W / fs)).fill(0).map(() => Math.random() * -50)
    }
    size()
    const draw = () => {
      x.fillStyle = 'rgba(2,6,4,.08)'
      x.fillRect(0, 0, W, H)
      x.font = `${fs}px monospace`
      for (let i = 0; i < drops.length; i++) {
        const ch = glyphs[(Math.random() * glyphs.length) | 0]
        const y = drops[i] * fs
        x.fillStyle = Math.random() > 0.975 ? '#d7fff0' : '#15e37a'
        x.fillText(ch, i * fs, y)
        if (y > H && Math.random() > 0.975) drops[i] = 0
        drops[i] += 1
      }
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 55) return
      last = t
      draw()
    }
    window.addEventListener('resize', size)
    if (reduced) { x.fillStyle = '#020604'; x.fillRect(0, 0, W, H); draw() }
    else raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [])
  return <canvas id="rain" ref={ref} aria-hidden="true" />
}
