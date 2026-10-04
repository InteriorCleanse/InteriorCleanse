#!/usr/bin/env node
// Runs the Freehold check on a list of public company domains and drafts a
// short first note for each. Nothing is sent: the owner reads every row and
// sends from their own mailbox, one at a time.
//
//   node scripts/prospects.mjs prospects.csv [--base https://freeholdprivate.com]
//
// Input CSV header: domain,firm,contact   (firm and contact are optional)
// Output: prospects-out.csv next to the input.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const baseArg = args.indexOf('--base')
const base = (baseArg >= 0 ? args[baseArg + 1] : process.env.FREEHOLD_URL || 'http://localhost:3000').replace(/\/$/, '')
if (!file) {
  console.error('Usage: node scripts/prospects.mjs prospects.csv [--base https://your-domain]')
  process.exit(1)
}

const parseLine = (line) => {
  const out = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
const head = parseLine(lines[0]).map((h) => h.toLowerCase())
const rows = lines.slice(1).map((l) => Object.fromEntries(parseLine(l).map((v, i) => [head[i], v])))

const ORDER = { fail: 0, warn: 1, unknown: 2, pass: 3, na: 4 }

// Lowercase a sentence's first letter after a colon, unless it opens an acronym.
const mid = (s) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

function draft(row, r) {
  const worst = [...r.findings].filter((f) => f.status === 'fail' || f.status === 'warn').sort((a, b) => ORDER[a.status] - ORDER[b.status])[0]
  const hello = row.contact ? `Hello ${row.contact.split(' ')[0]},` : 'Hello,'
  const link = `${base}/check/?d=${encodeURIComponent(r.domain)}`
  if (!worst) return ''
  return [
    hello,
    '',
    `I ran a public check on ${r.domain}'s email records. One thing stood out: ${mid(worst.summary)}`,
    '',
    `The fix is usually an hour's work for whoever manages your DNS: ${worst.fix ? mid(worst.fix) : 'details are on the page below'}`,
    '',
    `The full result, readable without me: ${link}`,
    '',
    'I run Freehold, a one-person firm that reviews and fixes this for family offices and the people who advise them. If it would help to talk it through, reply and I will send two times. If not, no reply is needed and I will not follow up more than once.',
    '',
    '[Your name]',
    'Freehold',
  ].join('\n')
}

const out = [['domain', 'firm', 'contact', 'grade', 'worst_status', 'worst_finding', 'check_link', 'draft_note'].join(',')]
for (const [i, row] of rows.entries()) {
  const d = (row.domain || '').trim()
  if (!d) continue
  process.stdout.write(`${i + 1}/${rows.length} ${d} ... `)
  try {
    const res = await fetch(`${base}/api/check/?d=${encodeURIComponent(d)}`)
    const r = await res.json()
    if (!res.ok) throw new Error(r.error || res.status)
    const worst = [...r.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status])[0]
    out.push([r.domain, row.firm, row.contact, r.grade, worst.status, `${worst.label}: ${worst.summary}`, `${base}/check/?d=${r.domain}`, draft(row, r)].map(csv).join(','))
    console.log(r.grade)
  } catch (e) {
    out.push([d, row.firm, row.contact, '', 'error', String(e.message || e), '', ''].map(csv).join(','))
    console.log('error')
  }
  // Stay well under the site's rate limit.
  if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 6000))
}
const target = join(dirname(file), 'prospects-out.csv')
writeFileSync(target, out.join('\n') + '\n')
console.log(`\nWrote ${target}. Read every row before sending anything.`)
