import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#F2F3F0', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 34, top: 34, width: 96, height: 96, border: '10px solid #15171C' }} />
        <div style={{ position: 'absolute', left: 134, top: 134, width: 22, height: 22, borderRadius: 999, background: '#1E3FAE' }} />
      </div>
    ),
    size,
  )
}
