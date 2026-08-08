import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { blockingIssues, checkIntegrations } from '@/lib/jarvis-integrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Integration health for /admin/connections and the JARVIS status light.
 * Runs the same audit as the check_integrations tool without spending a Claude
 * call. `?deep=0` skips the live provider probes.
 */
export async function GET(req: Request) {
  try {
    const deep = new URL(req.url).searchParams.get('deep') !== '0'
    const checks = await checkIntegrations({ deep })
    const blocking = blockingIssues(checks)

    return NextResponse.json({
      checks,
      allConnected: blocking.length === 0,
      blockingCount: blocking.length,
      checkedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[admin/connections]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
