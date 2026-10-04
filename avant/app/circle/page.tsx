import type { Metadata } from 'next'
import { Circle } from '@/components/Circle'

export const metadata: Metadata = {
  title: 'AVANT Circle',
  description: 'The more you drive with AVANT, the less you pay: your trip fee falls with every few trips, and the AVANT Promise has your back.',
}

export default function CirclePage() {
  return (
    <div className="wrap page" style={{ maxWidth: 1040 }}>
      <Circle />
    </div>
  )
}
