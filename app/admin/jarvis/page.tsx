'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useVoice } from '@/components/jarvis/VoiceEngine'
import '@/components/jarvis/jarvis.css'

/** `hidden` turns go to Claude but are not rendered — used for the opening briefing. */
type Turn = { role: 'user' | 'assistant'; content: string; hidden?: boolean }
type ToolResult = { tool: string; ok: boolean; result: unknown }
type JarvisResponse = { reply?: string; toolResults?: ToolResult[]; error?: string }

const QUICK_COMMANDS = [
  { label: 'Revenue today', prompt: 'What is revenue today?' },
  { label: 'Recent orders', prompt: 'Show me the most recent orders.' },
  { label: 'Check connections', prompt: 'Check which integrations are connected.' },
  { label: 'Write a script', prompt: 'Write a TikTok script for the signature candle.' },
  { label: 'Subscriber count', prompt: 'How big is the email list?' },
]

const GREETING =
  'Greet me for the start of a session. Check revenue today and the integration status, then give me a one or two sentence briefing and ask what I need.'

const TOOL_TITLES: Record<string, string> = {
  get_revenue: 'Revenue',
  get_recent_orders: 'Recent orders',
  get_subscriber_count: 'Email list',
  get_top_products: 'Top products',
  send_email_to_customer: 'Email sent',
  write_tiktok_script: 'TikTok script',
  check_integrations: 'Integration status',
}

export default function JarvisPage() {
  const {
    listening,
    speaking,
    transcript,
    supported,
    error: voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useVoice()

  const [turns, setTurns] = useState<Turn[]>([])
  const [cards, setCards] = useState<ToolResult[]>([])
  const [thinking, setThinking] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<'unknown' | 'ok' | 'partial' | 'down'>('unknown')
  const [healthDetail, setHealthDetail] = useState('Checking…')
  const [muted, setMuted] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const turnsRef = useRef<Turn[]>([])
  const transcriptRef = useRef('')
  const mutedRef = useRef(false)
  const thinkingRef = useRef(false)
  const greetedRef = useRef(false)

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, cards, thinking])

  const send = useCallback(
    async (text: string, options: { hidden?: boolean } = {}) => {
      const message = text.trim()
      if (!message || thinkingRef.current) return

      thinkingRef.current = true
      stopSpeaking()
      setError(null)
      setThinking(true)

      const history: Turn[] = [...turnsRef.current, { role: 'user', content: message, hidden: options.hidden }]
      turnsRef.current = history
      setTurns(history)

      try {
        // Trailing slash: trailingSlash is on, and the slash-less URL answers 308.
        const res = await fetch('/api/admin/jarvis/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        })
        const data = (await res.json()) as JarvisResponse

        if (data.error) setError(data.error)
        if (data.toolResults?.length) setCards(data.toolResults)

        const reply = data.reply?.trim()
        if (reply) {
          const next: Turn[] = [...history, { role: 'assistant', content: reply }]
          turnsRef.current = next
          setTurns(next)
          if (!mutedRef.current) speak(reply)
        } else if (!data.error) {
          setError('JARVIS returned an empty response.')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach JARVIS.')
      } finally {
        thinkingRef.current = false
        setThinking(false)
      }
    },
    [speak, stopSpeaking],
  )

  // Integration health for the status light.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/connections/')
      .then((r) => r.json())
      .then((data: { allConnected?: boolean; blockingCount?: number; error?: string }) => {
        if (cancelled) return
        if (data.error) {
          setHealth('down')
          setHealthDetail(data.error)
        } else if (data.allConnected) {
          setHealth('ok')
          setHealthDetail('All systems connected')
        } else {
          const n = data.blockingCount ?? 0
          setHealth('partial')
          setHealthDetail(`${n} integration${n === 1 ? '' : 's'} need attention`)
        }
      })
      .catch(() => {
        if (cancelled) return
        setHealth('down')
        setHealthDetail('Status unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Opening briefing, once per mount.
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    void send(GREETING, { hidden: true })
  }, [send])

  const handleMic = () => {
    if (listening) {
      stopListening()
      // onresult lands just before onend; give the final transcript a tick.
      setTimeout(() => {
        const spoken = transcriptRef.current.trim()
        if (spoken) void send(spoken)
      }, 250)
    } else {
      stopSpeaking()
      startListening()
    }
  }

  const orbState = listening ? 'listening' : thinking ? 'thinking' : speaking ? 'speaking' : ''

  return (
    <div className="jarvis-shell">
      <header className="jarvis-topbar">
        <span className="jarvis-wordmark">
          JARVIS <i>◇</i> InteriorCleanse
        </span>
        <nav className="jarvis-nav">
          <Link href="/admin/">Dashboard</Link>
          <Link className={`jarvis-health jarvis-health--${health}`} href="/admin/connections/">
            <span className="jarvis-dot" />
            {healthDetail}
          </Link>
        </nav>
      </header>

      <div className="jarvis-orb-stage">
        <div className={`jarvis-orb ${orbState}`} aria-hidden="true" />
        {thinking && <div className="jarvis-orb-ring" aria-hidden="true" />}
        <p className="jarvis-state" aria-live="polite">
          {listening ? 'Listening' : thinking ? 'Thinking' : speaking ? 'Speaking' : 'Ready'}
        </p>
      </div>

      <div className="jarvis-transcript" ref={scrollRef}>
        {turns.map((turn, i) =>
          turn.hidden ? null : (
            <div key={i} className={`jarvis-turn jarvis-turn--${turn.role}`}>
              {turn.content}
            </div>
          ),
        )}
        {listening && transcript && (
          <div className="jarvis-turn jarvis-turn--user jarvis-turn--interim">{transcript}</div>
        )}
        {thinking && <div className="jarvis-turn jarvis-turn--assistant jarvis-turn--interim">…</div>}

        {cards.length > 0 && (
          <div className="jarvis-cards">
            {cards.map((card, i) => (
              <ToolCard key={`${card.tool}-${i}`} card={card} />
            ))}
          </div>
        )}
      </div>

      {error && <p className="jarvis-error">{error}</p>}
      {voiceError && <p className="jarvis-error">{voiceError}</p>}
      {!supported && (
        <p className="jarvis-error">
          This browser has no speech recognition. Chrome, Edge or Safari give you the microphone — typing works
          everywhere.
        </p>
      )}

      <div className="jarvis-quick">
        {QUICK_COMMANDS.map((cmd) => (
          <button key={cmd.label} type="button" onClick={() => void send(cmd.prompt)} disabled={thinking}>
            {cmd.label}
          </button>
        ))}
      </div>

      <footer className="jarvis-controls">
        <button
          type="button"
          className={`jarvis-mic-btn ${listening ? 'active' : ''}`}
          onClick={handleMic}
          disabled={!supported || thinking}
          aria-label={listening ? 'Stop listening and send' : 'Start listening'}
        >
          {listening ? '■' : '🎙'}
        </button>

        <form
          className="jarvis-input"
          onSubmit={(e) => {
            e.preventDefault()
            const value = typed
            setTyped('')
            void send(value)
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type a command…"
            disabled={thinking}
            aria-label="Type a command for JARVIS"
          />
          <button type="submit" disabled={thinking || !typed.trim()}>
            Send
          </button>
        </form>

        <button
          type="button"
          className="jarvis-ghost-btn"
          onClick={() => {
            if (speaking) stopSpeaking()
            setMuted((m) => !m)
          }}
          aria-label={muted ? 'Unmute spoken replies' : 'Mute spoken replies'}
        >
          {muted ? 'Muted' : speaking ? 'Stop' : 'Voice on'}
        </button>
      </footer>
    </div>
  )
}

function ToolCard({ card }: { card: ToolResult }) {
  const title = TOOL_TITLES[card.tool] ?? card.tool

  if (!card.ok) {
    return (
      <section className="jarvis-card jarvis-card--error">
        <h3>{title}</h3>
        <p>{(card.result as { error?: string })?.error ?? 'Tool failed.'}</p>
      </section>
    )
  }

  const result = card.result

  if (card.tool === 'get_revenue') {
    const r = result as { period: string; revenue: number; orders: number; averageOrder: number; configured?: boolean }
    if (r.configured === false) {
      return (
        <section className="jarvis-card">
          <h3>{title}</h3>
          <p>Stripe is not connected, so there is nothing to total yet.</p>
        </section>
      )
    }
    return (
      <section className="jarvis-card">
        <h3>
          {title} <em>{r.period}</em>
        </h3>
        <div className="jarvis-stats">
          <div>
            <b>${r.revenue.toLocaleString()}</b>
            <span>Revenue</span>
          </div>
          <div>
            <b>{r.orders}</b>
            <span>Orders</span>
          </div>
          <div>
            <b>${r.averageOrder}</b>
            <span>Average order</span>
          </div>
        </div>
      </section>
    )
  }

  if (card.tool === 'write_tiktok_script') {
    const r = result as { product?: string; script?: string }
    return (
      <section className="jarvis-card">
        <h3>
          {title} <em>{r.product}</em>
        </h3>
        <pre>{r.script}</pre>
      </section>
    )
  }

  if (Array.isArray(result)) {
    if (result.length === 0) {
      return (
        <section className="jarvis-card">
          <h3>{title}</h3>
          <p>Nothing to show yet.</p>
        </section>
      )
    }
    const rows = result as Array<Record<string, unknown>>
    const columns = Object.keys(rows[0])
    return (
      <section className="jarvis-card">
        <h3>{title}</h3>
        <div className="jarvis-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{String(row[c] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  return (
    <section className="jarvis-card">
      <h3>{title}</h3>
      <dl className="jarvis-kv">
        {Object.entries(result as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}
