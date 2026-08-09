#!/usr/bin/env node
/**
 * Platform owner bootstrap.
 *
 * Syncs PLATFORM_OWNER_EMAILS into the allowlist table, then claims ownership
 * for the named user if they have already signed up. Uses the service role, so
 * run it from a trusted machine or CI — never from the browser or a route.
 *
 *   node scripts/bootstrap-owner.mjs                 # sync allowlist only
 *   node scripts/bootstrap-owner.mjs you@example.com # sync, then claim
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const allowlist = (process.env.PLATFORM_OWNER_EMAILS ?? '')
  .split(/[,\s]+/)
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.includes('@'))

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
if (allowlist.length === 0) {
  console.error('PLATFORM_OWNER_EMAILS is empty — nothing to allow.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error: upsertError } = await supabase
  .from('platform_owner_allowlist')
  .upsert(allowlist.map((email) => ({ email, note: 'from PLATFORM_OWNER_EMAILS' })), {
    onConflict: 'email',
  })

if (upsertError) {
  console.error('Failed to sync allowlist:', upsertError.message)
  process.exit(1)
}
console.log(`Allowlist synced: ${allowlist.join(', ')}`)

const target = process.argv[2]?.toLowerCase()
if (!target) {
  console.log('No email argument given. Sign up, then re-run with that email to claim ownership.')
  process.exit(0)
}

if (!allowlist.includes(target)) {
  console.error(`${target} is not in PLATFORM_OWNER_EMAILS.`)
  process.exit(1)
}

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id')
  .ilike('email', target)
  .maybeSingle()

if (profileError) {
  console.error('Lookup failed:', profileError.message)
  process.exit(1)
}
if (!profile) {
  console.error(`No account for ${target} yet. Sign up through /signup first, then re-run.`)
  process.exit(1)
}

const { error: claimError } = await supabase.rpc('claim_platform_ownership', {
  claimant: profile.id,
})

if (claimError) {
  console.error('Claim failed:', claimError.message)
  process.exit(1)
}

console.log(`${target} is now platform_owner. Recorded in audit_logs.`)
