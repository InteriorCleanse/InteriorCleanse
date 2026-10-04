import { Resolver } from 'node:dns/promises'
import {
  DKIM_SELECTORS,
  checkCaa,
  checkDkim,
  checkDmarc,
  checkMtaSts,
  checkMx,
  checkSpf,
  checkTlsRpt,
  joinTxt,
  score,
  spfLookupTerms,
  type Finding,
} from './check-rules'

export type CheckResult = {
  domain: string
  checkedAt: string
  findings: Finding[]
  passed: number
  scored: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

function resolver() {
  return new Resolver({ timeout: 2000, tries: 2 })
}

async function txt(r: Resolver, name: string): Promise<string[] | null> {
  try {
    return joinTxt(await r.resolveTxt(name))
  } catch (e) {
    const code = (e as { code?: string }).code
    return code === 'ENOTFOUND' || code === 'ENODATA' ? [] : null
  }
}

/** Counts SPF DNS lookups recursively, capped so a hostile record cannot fan out. */
async function spfLookups(r: Resolver, record: string, budget = { left: 20 }): Promise<number | null> {
  const { includes, redirect, direct } = spfLookupTerms(record)
  let count = direct + includes.length + (redirect ? 1 : 0)
  for (const name of [...includes, ...(redirect ? [redirect] : [])]) {
    if (budget.left-- <= 0) return count
    const answers = await txt(r, name)
    if (answers === null) return null
    const child = answers.find((t) => /^v=spf1(\s|$)/i.test(t))
    if (child) {
      const n = await spfLookups(r, child, budget)
      if (n === null) return null
      count += n
    }
  }
  return count
}

export async function runCheck(domain: string): Promise<CheckResult> {
  const r = resolver()
  const [mx, rootTxt, dmarcTxt, stsTxt, rptTxt, caa] = await Promise.all([
    r.resolveMx(domain).catch(() => []),
    txt(r, domain),
    txt(r, `_dmarc.${domain}`),
    txt(r, `_mta-sts.${domain}`),
    txt(r, `_smtp._tls.${domain}`),
    r.resolveCaa(domain).catch(() => []),
  ])
  const mxFinding = checkMx(mx)
  const receivesMail = mxFinding.status === 'pass'

  const spfRecord = (rootTxt || []).find((t) => /^v=spf1(\s|$)/i.test(t))
  const redirect = spfRecord ? spfLookupTerms(spfRecord).redirect : undefined
  const [lookups, redirectRecord, wildcardAnswer] = await Promise.all([
    spfRecord ? spfLookups(r, spfRecord) : Promise.resolve(0),
    redirect ? txt(r, redirect).then((a) => (a || []).find((t) => /^v=spf1(\s|$)/i.test(t))) : Promise.resolve(undefined),
    // A name nobody would choose: if it answers, the domain has a wildcard.
    txt(r, `fh-${Math.random().toString(36).slice(2, 10)}._domainkey.${domain}`),
  ])
  const wildcard = (wildcardAnswer || []).some((t) => /(^|;)\s*p=\s*[A-Za-z0-9+/]/.test(t))

  const dkimFound = (
    await Promise.all(
      DKIM_SELECTORS.map(async (selector) => {
        const answers = await txt(r, `${selector}._domainkey.${domain}`)
        const record = (answers || []).find((t) => /(^|;)\s*(v=DKIM1|k=rsa|k=ed25519|p=)/i.test(t))
        return record ? { selector, record } : null
      }),
    )
  ).filter((x): x is { selector: string; record: string } => x !== null)

  const findings: Finding[] = [
    mxFinding,
    rootTxt === null
      ? { id: 'spf', label: 'SPF: who may send as you', status: 'unknown', summary: 'The DNS lookup timed out. Try again in a minute.' }
      : checkSpf(rootTxt, lookups, receivesMail, redirectRecord),
    dmarcTxt === null
      ? { id: 'dmarc', label: 'DMARC: what happens to forgeries', status: 'unknown', summary: 'The DNS lookup timed out. Try again in a minute.' }
      : checkDmarc(dmarcTxt, receivesMail),
    checkDkim(dkimFound, receivesMail, wildcard),
    checkMtaSts(stsTxt || [], receivesMail),
    checkTlsRpt(rptTxt || [], receivesMail),
    checkCaa(caa),
  ]
  return { domain, checkedAt: new Date().toISOString(), findings, ...score(findings) }
}
