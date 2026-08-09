'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ReadinessTab } from '@/components/admin/ReadinessTab'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AdminContact } from '@/app/api/admin/contacts/route'
import type { AdminOrder } from '@/app/api/admin/orders/route'
import type { Analytics } from '@/app/api/admin/analytics/route'
import type { EmailTrigger, GeneratedEmail } from '@/lib/ai-email'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

const TABS = ['Contacts', 'Orders', 'Analytics', '3D Readiness', 'Email'] as const
type Tab = (typeof TABS)[number]

const CHART_COLORS = ['#A9895A', '#7FA872', '#4A9EFF', '#C4A8E8', '#C4A96E']

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('Contacts')
  const router = useRouter()

  const signOut = async () => {
    await fetch('/api/admin/login/', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="wordmark">
          INTERIOR<em>◇</em>CLEANSE
        </span>
        <nav className="admin-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={`admin-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <button className="admin-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="admin-main">
        {tab === 'Contacts' ? <ContactsTab /> : null}
        {tab === 'Orders' ? <OrdersTab /> : null}
        {tab === 'Analytics' ? <AnalyticsTab /> : null}
        {tab === '3D Readiness' ? <ReadinessTab /> : null}
        {tab === 'Email' ? <EmailTab /> : null}
      </main>
    </div>
  )
}

function Panel({
  error,
  loading,
  empty,
  children,
}: {
  error?: Error
  loading: boolean
  empty?: string
  children: React.ReactNode
}) {
  if (error) return <p className="admin-error">{error.message}</p>
  if (loading) return <p className="admin-muted">Loading…</p>
  if (empty) return <p className="admin-muted">{empty}</p>
  return <>{children}</>
}

/* ── Tab 1: Contacts ───────────────────────────────────────────────── */

function ContactsTab() {
  const { data, error, isLoading } = useSWR<{
    contacts: AdminContact[]
    configured: boolean
  }>('/api/admin/contacts/', fetcher)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AdminContact | null>(null)

  const filtered = useMemo(() => {
    const list = data?.contacts ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q)
    )
  }, [data, query])

  return (
    <section>
      <div className="admin-toolbar">
        <h2>Contacts</h2>
        <input
          className="admin-search"
          placeholder="Search email, name, or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Panel
        error={error}
        loading={isLoading}
        empty={
          data && !data.configured
            ? 'Brevo is not configured — add BREVO_API_KEY to see contacts.'
            : data && filtered.length === 0
              ? 'No contacts match.'
              : undefined
        }
      >
        <div className="admin-split">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Signed up</th>
                  <th className="num">Spent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.email}
                    onClick={() => setSelected(c)}
                    className={selected?.email === c.email ? 'selected' : ''}
                  >
                    <td>{c.email}</td>
                    <td>{c.source}</td>
                    <td>{shortDate(c.signupDate)}</td>
                    <td className="num">{money(c.totalSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected ? (
            <aside className="admin-panel">
              <button className="admin-panel-close" onClick={() => setSelected(null)}>
                ✕
              </button>
              <p className="eyebrow">Contact</p>
              <h3>
                {selected.firstName || selected.lastName
                  ? `${selected.firstName} ${selected.lastName}`.trim()
                  : selected.email}
              </h3>
              <dl className="admin-dl">
                <div>
                  <dt>Email</dt>
                  <dd>{selected.email}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selected.source}</dd>
                </div>
                <div>
                  <dt>Signed up</dt>
                  <dd>{shortDate(selected.signupDate)}</dd>
                </div>
                <div>
                  <dt>Last order</dt>
                  <dd>{shortDate(selected.lastOrderDate)}</dd>
                </div>
                <div>
                  <dt>Total spent</dt>
                  <dd>{money(selected.totalSpent)}</dd>
                </div>
                <div>
                  <dt>Lists</dt>
                  <dd>{selected.listIds.join(', ') || '—'}</dd>
                </div>
              </dl>
            </aside>
          ) : null}
        </div>
      </Panel>
    </section>
  )
}

/* ── Tab 2: Orders ─────────────────────────────────────────────────── */

function OrdersTab() {
  const { data, error, isLoading } = useSWR<{
    orders: AdminOrder[]
    revenue: number
    configured: boolean
  }>('/api/admin/orders/', fetcher)

  return (
    <section>
      <div className="admin-toolbar">
        <h2>Orders</h2>
        {data?.configured ? (
          <span className="admin-total">{money(data.revenue)} total</span>
        ) : null}
      </div>

      <Panel
        error={error}
        loading={isLoading}
        empty={
          data && !data.configured
            ? 'Stripe is not configured — add STRIPE_SECRET_KEY to see orders.'
            : data && data.orders.length === 0
              ? 'No paid orders yet.'
              : undefined
        }
      >
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Products</th>
                <th className="num">Amount</th>
                <th>Fulfilment</th>
                <th>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {(data?.orders ?? []).map((o) => (
                <tr key={o.id}>
                  <td>{shortDate(o.date)}</td>
                  <td>
                    {o.customer}
                    <br />
                    <span className="admin-muted">{o.email}</span>
                  </td>
                  <td>{o.products.join(', ') || '—'}</td>
                  <td className="num">{money(o.amount)}</td>
                  <td>{o.fulfillment}</td>
                  <td>
                    {o.tracking ? (
                      <a href={o.tracking} target="_blank" rel="noreferrer">
                        Track ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

/* ── Tab 3: Analytics ──────────────────────────────────────────────── */

function AnalyticsTab() {
  const { data, error, isLoading } = useSWR<Analytics>('/api/admin/analytics/', fetcher)

  return (
    <section>
      <div className="admin-toolbar">
        <h2>Analytics</h2>
      </div>

      <Panel error={error} loading={isLoading}>
        {data ? (
          <>
            <div className="admin-stats">
              <Stat label="Total revenue" value={money(data.totalRevenue)} />
              <Stat label="Orders" value={String(data.totalOrders)} />
              <Stat label="Avg order value" value={money(data.avgOrderValue)} />
              <Stat label="Email list" value={data.listSize.toLocaleString()} />
            </div>

            <div className="admin-charts">
              <div className="admin-chart">
                <p className="eyebrow">Revenue — last {8} weeks</p>
                {data.revenueByWeek.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.revenueByWeek}>
                      <CartesianGrid stroke="rgba(247,244,239,0.08)" />
                      <XAxis dataKey="week" stroke="#8C8479" fontSize={11} />
                      <YAxis stroke="#8C8479" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: '#1C1A17', border: '1px solid #A9895A' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#A9895A"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="admin-muted">No revenue in this window.</p>
                )}
              </div>

              <div className="admin-chart">
                <p className="eyebrow">Top products by units</p>
                {data.topProducts.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.topProducts}>
                      <CartesianGrid stroke="rgba(247,244,239,0.08)" />
                      <XAxis dataKey="name" stroke="#8C8479" fontSize={10} />
                      <YAxis stroke="#8C8479" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#1C1A17', border: '1px solid #A9895A' }}
                      />
                      <Bar dataKey="units" fill="#A9895A" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="admin-muted">No product sales yet.</p>
                )}
              </div>

              <div className="admin-chart">
                <p className="eyebrow">Acquisition source</p>
                {data.trafficSources.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={data.trafficSources}
                        dataKey="count"
                        nameKey="source"
                        outerRadius={90}
                        label
                      >
                        {data.trafficSources.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1C1A17', border: '1px solid #A9895A' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="admin-muted">No source data yet.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </Panel>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
    </div>
  )
}

/* ── Tab 4: Email composer ─────────────────────────────────────────── */

const TRIGGERS: EmailTrigger[] = [
  'welcome',
  'post-purchase',
  'abandoned-cart',
  'review-request',
  'win-back',
  'cross-sell',
]

function EmailTab() {
  const { data } = useSWR<{ contacts: AdminContact[] }>('/api/admin/contacts/', fetcher)
  const [to, setTo] = useState('')
  const [firstName, setFirstName] = useState('')
  const [trigger, setTrigger] = useState<EmailTrigger>('welcome')
  const [products, setProducts] = useState('')
  const [email, setEmail] = useState<GeneratedEmail | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const payload = () => ({
    to,
    firstName: firstName || 'there',
    trigger,
    products: products
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  })

  const generate = async () => {
    setBusy(true)
    setStatus('')
    try {
      const res = await fetch('/api/send-ai-email/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload(), preview: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setEmail(json.email)
      setStatus('Generated — edit below, then send.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!to) {
      setStatus('Add a recipient first.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const res = await fetch('/api/send-ai-email/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the edited copy, so what was reviewed is what arrives.
        body: JSON.stringify({ ...payload(), email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStatus(`Sent to ${to}${json.edited ? ' (your edited copy)' : ''}.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Send failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="admin-toolbar">
        <h2>Email composer</h2>
      </div>

      <div className="admin-composer">
        <div className="admin-form">
          <label>
            Recipient
            <input
              className="admin-search"
              list="admin-contacts"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <datalist id="admin-contacts">
            {(data?.contacts ?? []).map((c) => (
              <option key={c.email} value={c.email} />
            ))}
          </datalist>

          <label>
            First name
            <input
              className="admin-search"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="there"
            />
          </label>

          <label>
            Trigger
            <select
              className="admin-search"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as EmailTrigger)}
            >
              {TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            Products (comma separated)
            <input
              className="admin-search"
              value={products}
              onChange={(e) => setProducts(e.target.value)}
              placeholder="Signature Candle, Linen Tote"
            />
          </label>

          <div className="admin-actions">
            <button className="btn-ghost" onClick={generate} disabled={busy}>
              {busy ? 'Working…' : 'Generate with Claude'}
            </button>
            <button className="btn-primary" onClick={send} disabled={busy || !email}>
              Send
            </button>
          </div>

          {status ? <p className="admin-muted">{status}</p> : null}
        </div>

        {email ? (
          <div className="admin-preview">
            <label>
              Subject
              <input
                className="admin-search"
                value={email.subject}
                onChange={(e) => setEmail({ ...email, subject: e.target.value })}
              />
            </label>
            <label>
              Body
              <textarea
                className="admin-search"
                rows={12}
                value={email.body}
                onChange={(e) => setEmail({ ...email, body: e.target.value })}
              />
            </label>
            <label>
              CTA text
              <input
                className="admin-search"
                value={email.ctaText}
                onChange={(e) => setEmail({ ...email, ctaText: e.target.value })}
              />
            </label>
            <label>
              CTA link
              <input
                className="admin-search"
                value={email.ctaUrl}
                onChange={(e) => setEmail({ ...email, ctaUrl: e.target.value })}
              />
            </label>
            <p className="admin-muted">
              Send delivers exactly what is shown here — edits included.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
