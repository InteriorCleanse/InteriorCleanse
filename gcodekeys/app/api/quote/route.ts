import { NextResponse } from 'next/server'
import { decodeVin } from '@/lib/vin'

export const runtime = 'nodejs'

// POST { vin } -> decoded vehicle + example flat price.
export async function POST(req: Request) {
  try {
    const { vin } = (await req.json()) as { vin?: string }
    if (!vin || !vin.trim()) {
      return NextResponse.json({ error: 'Enter a VIN or plate.' }, { status: 400 })
    }
    const match = await decodeVin(vin)
    return NextResponse.json({ ...match, example: true })
  } catch (e) {
    console.error('[quote]', e)
    return NextResponse.json({ error: 'Could not decode that right now.' }, { status: 502 })
  }
}
