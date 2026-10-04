import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseDomain, checkSpf, checkDmarc, checkDkim, checkMx, checkMtaSts, checkCaa, spfLookupTerms, dkimKeyBits, score } from '../lib/check-rules.ts'

test('normaliseDomain accepts the forms people paste', () => {
  assert.equal(normaliseDomain('Example.com'), 'example.com')
  assert.equal(normaliseDomain('https://www.example.co.uk/about?x=1'), 'example.co.uk')
  assert.equal(normaliseDomain('jane@family-office.com'), 'family-office.com')
  assert.equal(normaliseDomain('example.com.'), 'example.com')
})

test('normaliseDomain rejects what is not a domain', () => {
  for (const bad of ['', 'localhost', '127.0.0.1', 'exa mple.com', '-bad.com', 'a'.repeat(300) + '.com', 'http://', 'x.c']) assert.equal(normaliseDomain(bad), null, bad)
})

test('SPF: missing, duplicate, permissive, soft, strict', () => {
  assert.equal(checkSpf([], 0, true).status, 'fail')
  assert.equal(checkSpf(['v=spf1 -all', 'v=spf1 ~all'], 0, true).status, 'fail')
  assert.equal(checkSpf(['v=spf1 +all'], 0, true).status, 'fail')
  assert.equal(checkSpf(['v=spf1 include:_spf.google.com ?all'], 1, true).status, 'fail')
  assert.equal(checkSpf(['v=spf1 include:_spf.google.com ~all'], 4, true).status, 'warn')
  assert.equal(checkSpf(['v=spf1 include:_spf.google.com -all'], 4, true).status, 'pass')
  assert.equal(checkSpf(['v=spf1 include:a -all'], 11, true).status, 'fail')
  assert.equal(checkSpf(['v=spf1 include:a -all'], 9, true).status, 'warn')
  assert.equal(checkSpf(['v=spf1 ptr -all'], 1, true).status, 'warn')
})

test('SPF lookup terms count the mechanisms that cost a lookup', () => {
  const t = spfLookupTerms('v=spf1 ip4:1.2.3.4 a mx include:x.com include:y.com exists:%{i}.z ~all redirect=r.com')
  assert.deepEqual(t.includes, ['x.com', 'y.com'])
  assert.equal(t.redirect, 'r.com')
  assert.equal(t.direct, 3)
})

test('DMARC: missing, none, quarantine, reject without reports, reject with reports', () => {
  assert.equal(checkDmarc([], true).status, 'fail')
  assert.equal(checkDmarc(['v=DMARC1; p=none; rua=mailto:a@b.c'], true).status, 'fail')
  assert.equal(checkDmarc(['v=DMARC1; p=quarantine; rua=mailto:a@b.c'], true).status, 'warn')
  assert.equal(checkDmarc(['v=DMARC1; p=reject'], true).status, 'warn')
  assert.equal(checkDmarc(['v=DMARC1; p=reject; pct=50; rua=mailto:a@b.c'], true).status, 'warn')
  assert.equal(checkDmarc(['v=DMARC1; p=reject; rua=mailto:a@b.c'], true).status, 'pass')
  assert.equal(checkDmarc(['v=DMARC1; p=reject', 'v=DMARC1; p=none'], true).status, 'fail')
})

test('DKIM key size and findings', () => {
  assert.equal(dkimKeyBits('v=DKIM1; k=rsa; p=' + 'A'.repeat(216)), 1024)
  assert.equal(dkimKeyBits('v=DKIM1; k=rsa; p=' + 'A'.repeat(392)), 2048)
  assert.equal(checkDkim([], true).status, 'unknown')
  assert.equal(checkDkim([], false).status, 'na')
  assert.equal(checkDkim([{ selector: 'google', record: 'v=DKIM1; p=' + 'A'.repeat(392) }], true).status, 'pass')
  assert.equal(checkDkim([{ selector: 'k1', record: 'v=DKIM1; p=' + 'A'.repeat(216) }], true).status, 'warn')
})

test('Parked domains: no MX makes mail-receiving checks not applicable', () => {
  assert.equal(checkMx([]).status, 'na')
  assert.equal(checkMtaSts([], false).status, 'na')
  assert.equal(checkMtaSts([], true).status, 'warn')
  assert.equal(checkCaa([]).status, 'warn')
  assert.equal(checkCaa([{ issue: 'letsencrypt.org' }]).status, 'pass')
})

test('score caps the grade when SPF or DMARC fails', () => {
  const s = score([
    { id: 'spf', label: '', status: 'pass', summary: '' },
    { id: 'dmarc', label: '', status: 'fail', summary: '' },
    { id: 'caa', label: '', status: 'pass', summary: '' },
    { id: 'mtasts', label: '', status: 'pass', summary: '' },
    { id: 'tlsrpt', label: '', status: 'pass', summary: '' },
    { id: 'dkim', label: '', status: 'pass', summary: '' },
    { id: 'mx', label: '', status: 'na', summary: '' },
  ])
  assert.equal(s.scored, 6)
  assert.equal(s.grade, 'C')
})

test('SPF redirect carries the policy of its target', () => {
  assert.equal(checkSpf(['v=spf1 redirect=_spf.google.com'], 4, true, 'v=spf1 include:_netblocks.google.com ~all').status, 'warn')
  assert.equal(checkSpf(['v=spf1 redirect=_spf.example.com'], 2, true, 'v=spf1 ip4:1.2.3.4 -all').status, 'pass')
})

test('DKIM: revoked (empty p=) keys and wildcards are not counted as keys', () => {
  assert.equal(dkimKeyBits('v=DKIM1; p='), null)
  assert.equal(checkDkim([{ selector: 'google', record: 'v=DKIM1; p=' }], true).status, 'unknown')
  assert.equal(checkDkim([{ selector: 'google', record: 'v=DKIM1; p=' + 'A'.repeat(392) }], true, true).status, 'unknown')
  assert.match(checkDkim([{ selector: 'k1', record: 'p=' + 'A'.repeat(216) }], true).summary, /the k1 key is 1024-bit/)
})
