/**
 * Data minimisation: what AVANT stops keeping, and when. Run daily by the
 * cron. Each rule is a single delete, safe to repeat.
 */

import { db } from './db.ts'

export async function purgeExpired(): Promise<Record<string, number>> {
  const d = await db()
  const count = async (sql: string) => (await d.query(`${sql} returning 1`)).length
  return {
    // Sign-ins past their 30-day life.
    sessions: await count(`delete from sessions where expires_at < now() or last_seen_at < now() - interval '14 days'`),
    // Reset links: used or expired, gone after a day.
    resets: await count(`delete from password_resets where expires_at < now() - interval '1 day' or used_at < now() - interval '1 day'`),
    // Rate-limit counters idle for a day are back to full anyway.
    rateLimits: await count(`delete from rate_limits where updated < now() - interval '1 day'`),
    // Notifications: read ones after six months, all after thirteen.
    notifications: await count(
      `delete from notifications where (read_at is not null and created_at < now() - interval '180 days') or created_at < now() - interval '400 days'`,
    ),
    // Delivery addresses: kept 30 days after a trip ends (for disputes), then blanked.
    addresses: await count(
      `update bookings set request = jsonb_set(request, '{deliveryAddress}', '""')
       where end_date < current_date - 30 and coalesce(request->>'deliveryAddress', '') <> ''`,
    ),
    // Verification links never used.
    verifications: await count(`delete from email_verifications where expires_at < now()`),
    // Listing photos uploaded but never attached to a listing (an abandoned wizard).
    orphanPhotos: await count(
      `delete from photos p where p.kind = 'listing' and p.listing_id is null and p.created_at < now() - interval '2 days'
         and not exists (select 1 from listings l where l.data->'photoIds' ? p.id)`,
    ),
    // Driver records not renewed in a year, matching the vault's own purge.
    driverRecords: await count(`delete from driver_records where updated_at < now() - interval '365 days'`),
    // Claim photos uploaded for a report that was never sent.
    orphanClaimPhotos: await count(
      `delete from photos p where p.kind = 'claim' and p.created_at < now() - interval '2 days'
         and not exists (select 1 from claims c where p.id = any(c.photo_ids))`,
    ),
  }
}
