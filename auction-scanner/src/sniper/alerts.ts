/** ALERTS — what the sniper did and found, newest first, kept to the last 200. */
import { randomUUID } from 'node:crypto'
import { readJson, writeJson } from '../store.ts'

export type Alert = {
  id: string
  at: number
  kind: 'pick' | 'paper-fired' | 'scan' | 'note'
  targetId?: string
  listingId?: string
  title: string
  body: string
  read: boolean
}

const FILE = 'alerts.json'

export function listAlerts(): Alert[] {
  return readJson<Alert[]>(FILE, [])
}

export function addAlert(a: Omit<Alert, 'id' | 'at' | 'read'>, now = Date.now()): Alert {
  const alert: Alert = { id: randomUUID(), at: now, read: false, ...a }
  const all = [alert, ...listAlerts()].slice(0, 200)
  writeJson(FILE, all)
  return alert
}

export function markAlertsRead(): number {
  const all = listAlerts()
  let n = 0
  for (const a of all) if (!a.read) { a.read = true; n++ }
  writeJson(FILE, all)
  return n
}

/** Has this listing already been fired on for this target? Prevents a second paper bid on a rescan. */
export function alreadyFired(targetId: string, listingId: string): boolean {
  return listAlerts().some((a) => a.kind === 'paper-fired' && a.targetId === targetId && a.listingId === listingId)
}
