'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CALL_HREF, SITE } from '@/lib/site'

type Finding = { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'na' | 'unknown'; summary: string; fix?: string; detail?: string }
type Result = { domain: string; checkedAt: string; findings: Finding[]; passed: number; scored: number; grade: string }

const LABEL: Record<Finding['status'], string> = { pass: 'Sound', warn: 'Attention', fail: 'Exposed', na: 'Not needed', unknown: 'Unconfirmed' }

function Mark({ status }: { status: Finding['status'] }) {
  // Shape carries the meaning, so status never depends on colour alone.
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="mt-1 flex-none">
      {status === 'pass' && <rect x="2" y="2" width="12" height="12" fill="var(--graphite)" />}
      {status === 'warn' && <rect x="2.75" y="2.75" width="10.5" height="10.5" fill="none" stroke="var(--graphite)" strokeWidth="1.5" />}
      {status === 'fail' && (
        <g stroke="var(--ink)" strokeWidth="1.75">
          <rect x="2.75" y="2.75" width="10.5" height="10.5" fill="none" />
          <path d="M5 5l6 6M11 5l-6 6" />
        </g>
      )}
      {(status === 'na' || status === 'unknown') && <rect x="2.75" y="2.75" width="10.5" height="10.5" fill="none" stroke="var(--stone)" strokeWidth="1" strokeDasharray="2 2" />}
    </svg>
  )
}

export function DomainCheck({ initial = '' }: { initial?: string }) {
  const [domain, setDomain] = useState(initial)
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<'idle' | 'sending' | 'sent' | 'fallback'>('idle')
  const resultRef = useRef<HTMLDivElement>(null)

  const run = useCallback(async (d: string) => {
    if (!d.trim()) return
    setState('running')
    setError('')
    setSent('idle')
    try {
      const res = await fetch(`/api/check/?d=${encodeURIComponent(d.trim())}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'The check could not finish.')
        return setState('error')
      }
      setResult(body as Result)
      setState('done')
      const url = new URL(window.location.href)
      url.searchParams.set('d', (body as Result).domain)
      window.history.replaceState(null, '', url.toString())
      requestAnimationFrame(() => resultRef.current?.focus())
    } catch {
      setError('The request did not reach the server.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('d')
    if (d) {
      setDomain(d)
      run(d)
    }
  }, [run])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    run(domain)
  }

  async function sendReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!result) return
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    setSent('sending')
    const lines = result.findings.map((f) => `${LABEL[f.status].toUpperCase()} | ${f.label}: ${f.summary}${f.fix ? ` Fix: ${f.fix}` : ''}`)
    const res = await fetch('/api/inquiry/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, kind: 'check-report', context: result.domain, message: `Grade ${result.grade}, ${result.passed} of ${result.scored} sound.\n\n${lines.join('\n')}` }),
    }).catch(() => null)
    setSent(res && res.ok ? 'sent' : 'fallback')
  }

  const exposed = result?.findings.filter((f) => f.status === 'fail').length || 0
  const attention = result?.findings.filter((f) => f.status === 'warn').length || 0

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 max-w-2xl" role="search" aria-label="Check a domain">
        <label className="sr-only" htmlFor="check-domain">Domain</label>
        <input
          id="check-domain"
          className="field text-lg flex-1"
          placeholder="yourfamilyoffice.com"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          maxLength={260}
          required
        />
        <button type="submit" className="cta justify-between" disabled={state === 'running'}>
          <span>{state === 'running' ? 'Checking' : 'Check'}</span>
          <span className="glyph" aria-hidden="true" />
        </button>
      </form>
      <p className="text-sm text-stone mt-3">Reads public DNS records only. Nothing is stored unless you ask for the report.</p>

      <div aria-live="polite" className="mt-12">
        {state === 'running' && (
          <ul className="max-w-3xl" aria-label="Checking">
            {Array.from({ length: 7 }).map((_, i) => (
              <li key={i} className="rule py-5 flex gap-4">
                <span className="w-4 h-4 bg-plate" />
                <span className="h-4 bg-plate flex-1 max-w-[28rem]" />
              </li>
            ))}
          </ul>
        )}
        {state === 'error' && (
          <p className="text-lg" role="alert">{error}</p>
        )}
        {state === 'done' && result && (
          <div ref={resultRef} tabIndex={-1} className="outline-none">
            <div className="rule pt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
              <p className="serif text-[7rem] leading-[0.8]" aria-label={`Grade ${result.grade}`}>{result.grade}</p>
              <div>
                <p className="mono">{result.domain}</p>
                <p className="serif text-3xl sm:text-4xl mt-2 max-w-[24ch]">
                  {exposed
                    ? `${exposed} exposed, ${attention} needing attention.`
                    : attention
                      ? `Nothing exposed. ${attention} needing attention.`
                      : 'Sound on every check a stranger can run.'}
                </p>
              </div>
            </div>
            <ul className="mt-10 max-w-3xl list-none">
              {result.findings.map((f) => (
                <li key={f.id} className="rule py-6 flex gap-4">
                  <Mark status={f.status} />
                  <div className="flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="serif text-2xl">{f.label}</span>
                      <span className={`mono ${f.status === 'fail' ? '!text-ink' : ''}`}>{LABEL[f.status]}</span>
                    </p>
                    <p className="text-stone mt-2">{f.summary}</p>
                    {f.fix && <p className="mt-2"><span className="mono mr-2">Fix</span>{f.fix}</p>}
                    {f.detail && (
                      <details className="mt-3">
                        <summary className="text-sm text-stone cursor-pointer">Record</summary>
                        <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all bg-plate p-3">{f.detail}</pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-14 grid gap-12 lg:grid-cols-2 max-w-5xl">
              <div className="rule pt-8">
                <h2 className="text-3xl sm:text-4xl">This is what a stranger sees in ten seconds.</h2>
                <p className="text-stone mt-4 max-w-[46ch]">
                  The two-week review goes further: every domain you own, the people and pages that give an attacker a script, and the admin accounts behind it all. Every finding with its fix, in order, written for whoever acts on it.
                  {SITE.reviewFee ? ` Fixed fee: ${SITE.reviewFee}.` : ''}
                </p>
                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 items-center">
                  <Link href={CALL_HREF} className="cta"><span>Request a call</span><span className="glyph" aria-hidden="true" /></Link>
                  <Link href="/private/review/" className="cta-quiet"><span className="dot" aria-hidden="true" /><span>What the review examines</span></Link>
                </div>
              </div>
              <div className="rule pt-8">
                <h2 className="text-3xl sm:text-4xl">Send me this report.</h2>
                {sent === 'sent' ? (
                  <p className="text-stone mt-4" role="status">Sent to the Freehold inbox. A person replies within two working days with what to fix first.</p>
                ) : (
                  <form onSubmit={sendReport} className="mt-4 grid gap-4">
                    <label className="grid gap-1.5 text-sm"><span>Name</span><input name="name" required autoComplete="name" className="field" maxLength={120} /></label>
                    <label className="grid gap-1.5 text-sm"><span>Email</span><input name="email" type="email" required autoComplete="email" className="field" maxLength={200} /></label>
                    <input type="text" name="company_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-4">
                      <button type="submit" className="cta" disabled={sent === 'sending'}><span>{sent === 'sending' ? 'Sending' : 'Send the report'}</span><span className="glyph" aria-hidden="true" /></button>
                      <span className="text-sm text-stone">Read by a person. Never sold.</span>
                    </div>
                    {sent === 'fallback' && (
                      <p className="text-sm" role="alert">
                        That did not go through. Email <a className="link" href={`mailto:${SITE.email}?subject=${encodeURIComponent(`Check: ${result.domain}`)}`}>{SITE.email}</a> and mention {result.domain}.
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
