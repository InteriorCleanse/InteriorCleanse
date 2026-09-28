import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Freehold. Software you own outright.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const serif = await fetch(new URL('./instrument-serif-400.woff', import.meta.url)).then((r) => r.arrayBuffer())
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#F2F3F0',
          color: '#15171C',
          fontFamily: 'Instrument Serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', position: 'relative', width: 56, height: 56 }}>
            <div style={{ position: 'absolute', left: 6, top: 6, width: 36, height: 36, border: '4px solid #15171C' }} />
            <div style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: 999, background: '#1E3FAE' }} />
          </div>
          <div style={{ fontSize: 34, letterSpacing: 8 }}>FREEHOLD</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 112, lineHeight: 1, letterSpacing: -2 }}>Software you own outright.</div>
          <div style={{ fontSize: 30, color: '#5C616B' }}>Your repo. Your database. Your key. Your bill.</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Instrument Serif', data: serif, style: 'normal', weight: 400 }] },
  )
}
