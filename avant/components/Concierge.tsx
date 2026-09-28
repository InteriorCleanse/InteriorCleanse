'use client'

/**
 * The AI concierge: a floating button on desktop, the centre tab on phones,
 * and the full page at /concierge. One conversation per tab, kept in memory
 * only; nothing typed here is stored by AVANT.
 */

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CardData } from '@/lib/card-data'
import { money } from '@/lib/format'
import { useModalDialog } from '@/lib/use-modal-dialog'
import type { BodyType } from '@/lib/types'
import { CarImage } from './CarImage'
import { Icon } from './Icons'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  cars?: CardData[]
  /** Server signature; unsigned assistant turns are ignored by the API. */
  sig?: string
}

const SUGGESTIONS = [
  'An SUV in Denver for this weekend under $100',
  'Explain coverage like I’m in a hurry',
  'I’m 21. What will I pay?',
  'Electric cars in Seattle',
]

interface Ctx {
  open: boolean
  setOpen: (o: boolean) => void
  ask: (text: string) => void
}

const ConciergeCtx = createContext<Ctx>({ open: false, setOpen: () => {}, ask: () => {} })
export const useConcierge = () => useContext(ConciergeCtx)

function useChat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi, I’m the AVANT concierge. Tell me where and when, and I’ll find the car, the price and the coverage. What are you planning?' },
  ])
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'ai' | 'offline' | null>(null)

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, 2000)
      if (!content || busy) return
      const next: Msg[] = [...msgs, { role: 'user', content }]
      setMsgs(next)
      setBusy(true)
      try {
        const history = next.filter((m, i) => !(i === 0 && m.role === 'assistant')).slice(-16)
        const res = await fetch('/api/concierge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history.map(({ role, content, sig }) => ({ role, content, ...(sig ? { sig } : {}) })) }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'error')
        setMode(json.mode)
        setMsgs((m) => [...m, { role: 'assistant', content: json.text, cars: json.cars, sig: json.sig }])
      } catch (err) {
        setMsgs((m) => [
          ...m,
          { role: 'assistant', content: err instanceof Error && err.message.startsWith('Too many') ? err.message : 'I couldn’t reach the concierge just now. Try again in a moment.' },
        ])
      } finally {
        setBusy(false)
      }
    },
    [msgs, busy],
  )
  return { msgs, busy, mode, send }
}

export function ChatView({ onNavigate, autoFocus }: { onNavigate?: () => void; autoFocus?: boolean }) {
  const { msgs, busy, mode, send } = useChat()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const pending = useContext(PendingAsk)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, busy])

  useEffect(() => {
    if (pending.text) {
      void send(pending.text)
      pending.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.text])

  return (
    <>
      <div className="ai-msgs" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className="stack" style={{ gap: 8, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div className="ai-msg" data-role={m.role}>
              {m.content}
            </div>
            {m.cars?.length ? (
              <div className="ai-cards" style={{ maxWidth: '100%' }}>
                {m.cars.map((c) => (
                  <Link key={c.slug} href={`/cars/${c.slug}`} className="ai-card" onClick={onNavigate}>
                    <CarImage body={c.body as BodyType} color="#d4ff3a" alt="" />
                    <div>
                      <strong>{c.title}</strong>
                      <div className="muted">
                        {c.city} · <span style={{ color: 'var(--lime)' }}>{money(c.allInDailyCents)}</span>/day all-in
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {msgs.length === 1 ? (
          <div className="ai-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {busy ? (
          <div className="ai-msg" data-role="assistant" aria-label="The concierge is typing">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
        <div ref={end} />
      </div>
      <form
        className="ai-compose"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
          setDraft('')
        }}
      >
        <label htmlFor="ai-input" className="sr-only">
          Message the concierge
        </label>
        <textarea
          id="ai-input"
          className="textarea"
          rows={1}
          value={draft}
          maxLength={2000}
          autoFocus={autoFocus}
          placeholder="Ask about cars, prices, coverage…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-md" disabled={busy || !draft.trim()} aria-label="Send">
          <Icon name="send" size={17} />
        </button>
      </form>
      {mode === 'offline' ? <p className="small dim" style={{ padding: '0 14px 10px' }}>Running on built-in answers (no AI key configured).</p> : null}
    </>
  )
}

const PendingAsk = createContext<{ text: string | null; clear: () => void }>({ text: null, clear: () => {} })

function Panel({ onClose }: { onClose: () => void }) {
  const ref = useModalDialog(true, onClose)
  return (
    <div ref={ref} className="ai-panel" role="dialog" aria-modal="true" aria-label="AVANT concierge" tabIndex={-1}>
      <div className="ai-head">
        <span className="ai-fab-orb" aria-hidden="true" />
        <div>
          <strong>Concierge</strong>
          <span className="small muted">Finds cars, prices trips, explains coverage. 24/7.</span>
        </div>
        <Link href="/concierge" className="icon-btn" aria-label="Open full screen" onClick={onClose}>
          <Icon name="arrow-right" size={17} />
        </Link>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <ChatView onNavigate={onClose} autoFocus />
    </div>
  )
}

export function ConciergeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const ask = useCallback((text: string) => {
    setPending(text)
    setOpen(true)
  }, [])
  return (
    <ConciergeCtx.Provider value={{ open, setOpen, ask }}>
      <PendingAsk.Provider value={{ text: pending, clear: () => setPending(null) }}>
        {children}
        {!open ? (
          <button type="button" className="ai-fab" onClick={() => setOpen(true)}>
            <span className="ai-fab-orb" aria-hidden="true" />
            Ask AVANT
          </button>
        ) : (
          <Panel onClose={() => setOpen(false)} />
        )}
      </PendingAsk.Provider>
    </ConciergeCtx.Provider>
  )
}
