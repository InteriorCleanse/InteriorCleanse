// Pure rules for the domain check. No imports, no network: every function
// takes DNS answers and returns a finding, so it can be tested with fixtures.

export type Status = 'pass' | 'warn' | 'fail' | 'na' | 'unknown'

export type Finding = {
  id: string
  label: string
  status: Status
  summary: string
  fix?: string
  detail?: string
}

const HOST = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/

/** Accepts "Example.com", "https://www.example.com/x", "user@example.com". Returns null if not a domain. */
export function normaliseDomain(input: string): string | null {
  let s = String(input || '').trim().toLowerCase()
  if (!s || s.length > 300) return null
  if (s.includes('@')) s = s.split('@').pop() || ''
  s = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  if (s.startsWith('www.')) s = s.slice(4)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return null
  return HOST.test(s) ? s : null
}

/** TXT answers arrive as string[][] (chunks); join each record. */
export function joinTxt(records: string[][] | undefined): string[] {
  return (records || []).map((chunks) => chunks.join(''))
}

export function checkMx(mx: { exchange: string; priority: number }[] | undefined): Finding {
  const list = (mx || []).filter((m) => m.exchange && m.exchange !== '.')
  if (!list.length) {
    return {
      id: 'mx',
      label: 'Mail servers',
      status: 'na',
      summary: 'This domain does not receive email. That is fine, but it should also refuse to send it.',
      fix: 'Publish "v=spf1 -all" and a DMARC record with p=reject, so nobody can send mail that claims to be this domain.',
    }
  }
  const hosts = list.sort((a, b) => a.priority - b.priority).map((m) => m.exchange)
  return { id: 'mx', label: 'Mail servers', status: 'pass', summary: `Mail is handled by ${providerOf(hosts[0])}.`, detail: hosts.join(', ') }
}

export function providerOf(host: string): string {
  const h = host.toLowerCase()
  if (h.includes('google') || h.includes('gmail')) return 'Google Workspace'
  if (h.includes('outlook') || h.includes('protection.outlook')) return 'Microsoft 365'
  if (h.includes('pphosted') || h.includes('proofpoint')) return 'Proofpoint'
  if (h.includes('mimecast')) return 'Mimecast'
  if (h.includes('zoho')) return 'Zoho'
  if (h.includes('protonmail') || h.includes('proton.ch')) return 'Proton'
  if (h.includes('messagingengine')) return 'Fastmail'
  return host
}

/** SPF mechanisms that cost a DNS lookup under RFC 7208's limit of ten. */
export function spfLookupTerms(record: string): { includes: string[]; redirect?: string; direct: number; ptr: boolean } {
  const terms = record.split(/\s+/).slice(1)
  const includes: string[] = []
  let redirect: string | undefined
  let direct = 0
  let ptr = false
  for (const raw of terms) {
    const t = raw.replace(/^[+\-~?]/, '').toLowerCase()
    if (t.startsWith('include:')) includes.push(t.slice(8))
    else if (t.startsWith('redirect=')) redirect = t.slice(9)
    else if (t === 'a' || t.startsWith('a:') || t.startsWith('a/') || t === 'mx' || t.startsWith('mx:') || t.startsWith('mx/') || t.startsWith('exists:')) direct++
    else if (t === 'ptr' || t.startsWith('ptr:')) {
      direct++
      ptr = true
    }
  }
  return { includes, redirect, direct, ptr }
}

export function checkSpf(txt: string[], lookups: number | null, receivesMail: boolean, redirectRecord?: string): Finding {
  const spf = txt.filter((t) => /^v=spf1(\s|$)/i.test(t))
  const base = { id: 'spf', label: 'SPF: who may send as you' }
  if (!spf.length) {
    return {
      ...base,
      status: 'fail',
      summary: 'No SPF record. Any server in the world can send mail that claims to come from this domain.',
      fix: receivesMail
        ? 'Publish one TXT record starting "v=spf1" that lists the services you send from and ends in "-all".'
        : 'Publish "v=spf1 -all" to say this domain never sends mail.',
    }
  }
  if (spf.length > 1) {
    return { ...base, status: 'fail', summary: `${spf.length} SPF records. Receivers treat more than one as an error and ignore them all.`, fix: 'Merge them into a single "v=spf1" record.', detail: spf.join('\n') }
  }
  const r = spf[0]
  let all = (r.match(/\s([+\-~?]?)all\b/i) || [])[1]
  // "redirect=" hands the whole policy to another record; its "all" applies.
  if (all === undefined && spfLookupTerms(r).redirect && redirectRecord) all = (redirectRecord.match(/\s([+\-~?]?)all\b/i) || [])[1]
  const { ptr } = spfLookupTerms(r)
  const issues: string[] = []
  const fixes: string[] = []
  let status: Status = 'pass'
  if (all === '' || all === '+' ) {
    status = 'fail'
    issues.push('It ends in "+all", which authorises every server on the internet.')
    fixes.push('End the record in "-all".')
  } else if (all === '?') {
    status = 'fail'
    issues.push('It ends in "?all", which says nothing about servers not on the list.')
    fixes.push('End the record in "-all".')
  } else if (all === undefined) {
    status = 'warn'
    issues.push('It has no "all" term, so unlisted senders are not rejected.')
    fixes.push('Add "-all" at the end.')
  } else if (all === '~') {
    status = 'warn'
    issues.push('It ends in "~all" (soft fail). Unlisted senders are marked, not refused.')
    fixes.push('Change "~all" to "-all" once every service you send from is listed, or rely on DMARC at p=reject.')
  }
  if (lookups !== null && lookups > 10) {
    status = 'fail'
    issues.push(`It needs ${lookups} DNS lookups. The limit is ten, so receivers may treat the whole record as broken.`)
    fixes.push('Remove senders you no longer use, or replace includes with their IP ranges, until it is under ten.')
  } else if (lookups !== null && lookups >= 8) {
    if (status === 'pass') status = 'warn'
    issues.push(`It uses ${lookups} of the ten DNS lookups allowed. One more sending service will break it.`)
    fixes.push('Remove senders you no longer use before adding another.')
  }
  if (ptr) {
    if (status === 'pass') status = 'warn'
    issues.push('It uses the "ptr" mechanism, which is slow, unreliable, and discouraged by the standard.')
    fixes.push('Remove "ptr".')
  }
  return {
    ...base,
    status,
    summary: issues.length ? issues.join(' ') : `Present and strict${lookups !== null ? `, using ${lookups} of 10 lookups` : ''}.`,
    fix: fixes.length ? fixes.join(' ') : undefined,
    detail: r,
  }
}

export function parseTags(record: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of record.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  return out
}

export function checkDmarc(txt: string[], receivesMail: boolean): Finding {
  const recs = txt.filter((t) => /^v=DMARC1\s*(;|$)/i.test(t))
  const base = { id: 'dmarc', label: 'DMARC: what happens to forgeries' }
  if (!recs.length) {
    return {
      ...base,
      status: 'fail',
      summary: 'No DMARC record. Mail forged in this domain’s name is delivered as if it were real, and nobody is told.',
      fix: receivesMail
        ? 'Publish "v=DMARC1; p=none; rua=mailto:<a mailbox you read>" today, read the reports for two weeks, then move to p=quarantine and p=reject.'
        : 'Publish "v=DMARC1; p=reject;" since this domain sends no mail.',
    }
  }
  if (recs.length > 1) {
    return { ...base, status: 'fail', summary: 'More than one DMARC record. Receivers ignore DMARC entirely when there are two.', fix: 'Keep exactly one record at _dmarc.', detail: recs.join('\n') }
  }
  const tags = parseTags(recs[0])
  const p = (tags.p || '').toLowerCase()
  const pct = tags.pct ? Number(tags.pct) : 100
  const issues: string[] = []
  let status: Status = 'pass'
  if (p === 'none' || !p) {
    status = 'fail'
    issues.push('The policy is "none": forgeries are reported but still delivered.')
  } else if (p === 'quarantine') {
    status = 'warn'
    issues.push('The policy is "quarantine": forgeries go to spam rather than being refused.')
  }
  if (p !== 'none' && pct < 100) {
    if (status === 'pass') status = 'warn'
    issues.push(`It applies to only ${pct} percent of mail (pct=${pct}).`)
  }
  if (!tags.rua) {
    if (status === 'pass') status = 'warn'
    issues.push('No reporting address (rua), so nobody sees who is sending as this domain.')
  }
  return {
    ...base,
    status,
    summary: issues.length ? issues.join(' ') : 'Enforced at p=reject, with reports collected.',
    fix: status === 'pass' ? undefined : 'Move to p=reject at pct=100 once the reports show every legitimate sender passing, and keep a rua address.',
    detail: recs[0],
  }
}

/** Rough RSA size from the base64 key length in a DKIM record. */
export function dkimKeyBits(record: string): number | null {
  const p = (parseTags(record).p || '').replace(/\s/g, '')
  if (!p) return null
  const n = p.replace(/\s/g, '').length
  if (n >= 700) return 4096
  if (n >= 380) return 2048
  if (n >= 200) return 1024
  return 512
}

export function checkDkim(raw: { selector: string; record: string }[], receivesMail: boolean, wildcard = false): Finding {
  const base = { id: 'dkim', label: 'DKIM: signed mail' }
  if (wildcard) return { ...base, status: 'unknown', summary: 'This domain answers every DKIM name the same way, so real keys cannot be told apart from here. A full review checks a real message.' }
  // An empty p= means a revoked key; it signs nothing.
  const found = raw.filter((f) => dkimKeyBits(f.record) !== null)
  if (!receivesMail && !found.length) return { ...base, status: 'na', summary: 'Not needed for a domain that sends no mail.' }
  if (!found.length) {
    return {
      ...base,
      status: 'unknown',
      summary: 'No DKIM key on the common selectors. It may use a custom selector; a full review confirms it from a real message.',
      fix: 'Turn on DKIM signing in your mail provider’s admin console and publish the key it gives you.',
    }
  }
  const weak = found.filter((f) => (dkimKeyBits(f.record) || 2048) < 2048)
  const names = found.map((f) => f.selector).join(', ')
  const weakNames = weak.map((w) => w.selector)
  if (weak.length) {
    return { ...base, status: 'warn', summary: `Signing keys found (${names}), but ${weakNames.length === 1 ? `the ${weakNames[0]} key is` : `the ${weakNames.join(', ')} keys are`} 1024-bit, below today\u2019s 2048-bit standard.`, fix: 'Rotate to a 2048-bit key in the mail provider’s admin console.' }
  }
  return { ...base, status: 'pass', summary: `Signing keys found on ${found.length === 1 ? 'selector' : 'selectors'} ${names}, at 2048 bits or more.` }
}

export function checkMtaSts(txt: string[], receivesMail: boolean): Finding {
  const base = { id: 'mtasts', label: 'MTA-STS: mail encrypted in transit' }
  if (!receivesMail) return { ...base, status: 'na', summary: 'Not needed for a domain that receives no mail.' }
  if (txt.some((t) => /^v=STSv1/i.test(t))) return { ...base, status: 'pass', summary: 'Published. Mail sent to you cannot be quietly downgraded to an unencrypted connection.' }
  return { ...base, status: 'warn', summary: 'Not published. A network attacker can strip encryption from mail on its way to you.', fix: 'Publish an MTA-STS policy (a TXT record at _mta-sts and a small policy file on https://mta-sts.<domain>).' }
}

export function checkTlsRpt(txt: string[], receivesMail: boolean): Finding {
  const base = { id: 'tlsrpt', label: 'TLS reporting' }
  if (!receivesMail) return { ...base, status: 'na', summary: 'Not needed for a domain that receives no mail.' }
  if (txt.some((t) => /^v=TLSRPTv1/i.test(t))) return { ...base, status: 'pass', summary: 'Published. Delivery failures over encrypted connections are reported to you.' }
  return { ...base, status: 'warn', summary: 'Not published. If encrypted delivery to you fails, nobody tells you.', fix: 'Publish "v=TLSRPTv1; rua=mailto:<a mailbox you read>" at _smtp._tls.' }
}

export function checkCaa(caa: { issue?: string; issuewild?: string }[] | undefined): Finding {
  const base = { id: 'caa', label: 'CAA: who may issue certificates' }
  const list = caa || []
  if (!list.length) return { ...base, status: 'warn', summary: 'No CAA record. Any certificate authority may issue certificates for this domain.', fix: 'Publish CAA records naming only the authorities you use, for example 0 issue "letsencrypt.org".' }
  const names = Array.from(new Set(list.map((c) => c.issue || c.issuewild).filter(Boolean)))
  return { ...base, status: 'pass', summary: `Only named authorities may issue certificates${names.length ? `: ${names.join(', ')}` : ''}.` }
}

export function score(findings: Finding[]): { passed: number; scored: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  const scored = findings.filter((f) => f.status === 'pass' || f.status === 'warn' || f.status === 'fail')
  const points = scored.reduce((n, f) => n + (f.status === 'pass' ? 2 : f.status === 'warn' ? 1 : 0), 0)
  const ratio = scored.length ? points / (scored.length * 2) : 0
  const hardFail = findings.some((f) => (f.id === 'spf' || f.id === 'dmarc') && f.status === 'fail')
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = ratio >= 0.9 ? 'A' : ratio >= 0.75 ? 'B' : ratio >= 0.6 ? 'C' : ratio >= 0.4 ? 'D' : 'F'
  if (hardFail && (grade === 'A' || grade === 'B')) grade = 'C'
  return { passed: scored.filter((f) => f.status === 'pass').length, scored: scored.length, grade }
}

export const DKIM_SELECTORS = [
  'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'default', 'mail', 'dkim',
  'mandrill', 'zoho', 'smtp', 'protonmail', 'protonmail2', 'fm1', 'fm2', 'fm3', 'mxvault', 'sig1',
]
