/**
 * Host leads: car owners who want to hear more before listing. Every lead
 * is emailed to the host team (AVANT_HOST_TEAM_EMAIL, else the support
 * inbox) with where it came from, so campaigns can be compared. Contact
 * details are used only to follow up about hosting, and deleted after a
 * year (lib/server/retention.ts).
 */

import { randomId } from '../security/crypto.ts'
import { normaliseEmail } from './accounts.ts'
import { db } from './db.ts'
import { sendEmail } from './email.ts'

export interface LeadInput {
  name: string
  email: string
  phone?: string
  city: string
  car: string
  cars: number
  source?: string
  medium?: string
  campaign?: string
}

/** Saves a lead (one per email: a repeat updates it). */
export async function saveLead(input: LeadInput): Promise<void> {
  const email = normaliseEmail(input.email)
  await (await db()).query(
    `insert into host_leads (id, name, email, phone, city, car, cars, source, medium, campaign) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (lower(email)) do update set name = excluded.name, phone = excluded.phone, city = excluded.city, car = excluded.car, cars = excluded.cars,
       source = coalesce(excluded.source, host_leads.source), medium = coalesce(excluded.medium, host_leads.medium), campaign = coalesce(excluded.campaign, host_leads.campaign)`,
    [randomId(12), input.name, email, input.phone || null, input.city, input.car, input.cars, input.source || null, input.medium || null, input.campaign || null],
  )
}

/** Tells the host team about a new lead. */
export async function notifyTeam(input: LeadInput): Promise<void> {
  const email = normaliseEmail(input.email)
  const to = process.env.AVANT_HOST_TEAM_EMAIL?.trim() || process.env.AVANT_SUPPORT_EMAIL?.trim()
  if (!to) return
  await sendEmail({
    to,
    subject: `New host lead: ${input.car} in ${input.city}${input.cars > 1 ? ` (${input.cars} cars)` : ''}`,
    text: [
      `${input.name} <${email}>${input.phone ? `, ${input.phone}` : ''}`,
      `City: ${input.city}`,
      `Car: ${input.car}${input.cars > 1 ? `, ${input.cars} cars in all` : ''}`,
      `Came from: ${[input.source, input.medium, input.campaign].filter(Boolean).join(' / ') || 'direct'}`,
      '',
      'Reply within a day: a quick, personal answer converts far better than a newsletter.',
    ].join('\n'),
  })
}

/** Leads for the team, newest first (used by the CSV export script). */
export async function recentLeads(limit = 500) {
  return (await db()).query(`select * from host_leads order by created_at desc limit $1`, [limit])
}
