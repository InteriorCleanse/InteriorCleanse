'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildPreview,
  FIELDS_FOR,
  IMPORT_KIND_LABELS,
  parseCsv,
  type ImportKind,
  type ParseResult,
  suggestMapping,
  validateRows,
} from '@/lib/import/csv'
import { Button, Eyebrow, Panel, inputClass } from '@/components/ui'

/**
 * Choose what the file is → drop it → map columns → preview → import.
 *
 * Every step before the last runs against the same pure functions the server
 * runs on commit, so what the operator approves is what gets written. Orders
 * already imported are not known client-side, so "already present" is
 * resolved at commit time and reported back; the preview says so rather than
 * implying a count it cannot know.
 */

export type BatchSummary = {
  id: string
  kind: string
  filename: string | null
  status: string
  rowCount: number
  skippedCount: number
  errorCount: number
  createdAt: string
}

type CommitResponse = {
  status: 'committed' | 'nothing_to_import'
  written?: number
  linesWritten?: number
  skippedExisting?: number
  skippedDuplicateInFile?: number
  errorRows?: number
  issues?: { line: number; field: string; message: string; severity: string }[]
}

const SAMPLES: Record<ImportKind, string> = {
  orders: `order id,date,product,qty,total,discount
1001,2026-01-05,Amber Candle,2,68.00,6.80
1001,2026-01-05,Canvas Tote,1,28.00,0.00
1002,2026-01-06,Canvas Tote,1,28.00,0.00`,
  expenses: `date,campaign,amount spent,currency
2026-01-05,Prospecting — broad,42.17,USD
2026-01-05,Retargeting — cart,11.90,USD
2026-01-06,Prospecting — broad,39.02,USD`,
}

export function ImportWizard({
  defaultCurrency,
  organizationName,
  batches,
  canRollback,
}: {
  defaultCurrency: string
  organizationName: string
  batches: BatchSummary[]
  canRollback: boolean
}) {
  const router = useRouter()
  const [kind, setKind] = useState<ImportKind>('orders')
  const [filename, setFilename] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [dragging, setDragging] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'warn' | 'error'; title: string; detail: string } | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const fields = FIELDS_FOR[kind]

  const parsed: ParseResult | null = useMemo(
    () => (text === null ? null : parseCsv(text)),
    [text],
  )

  const validation = useMemo(
    () =>
      parsed === null
        ? null
        : validateRows(parsed.rows, mapping, fields, { defaultCurrency }),
    [parsed, mapping, fields, defaultCurrency],
  )

  const preview = useMemo(
    () => (parsed && validation ? buildPreview(parsed, validation, new Set()) : null),
    [parsed, validation],
  )

  function chooseKind(next: ImportKind) {
    setKind(next)
    setOutcome(null)
    if (parsed) setMapping(suggestMapping(parsed.headers, FIELDS_FOR[next]))
  }

  async function acceptFile(file: File) {
    setReadError(null)
    setOutcome(null)
    if (file.size > 8 * 1024 * 1024) {
      setReadError('That file is larger than 8 MB. Split it and import in parts.')
      return
    }
    try {
      const content = await file.text()
      const result = parseCsv(content)
      if (result.headers.length === 0) {
        setReadError('No columns found. Is this a CSV?')
        return
      }
      setFilename(file.name)
      setText(content)
      setMapping(suggestMapping(result.headers, fields))
    } catch {
      setReadError('Could not read that file.')
    }
  }

  async function commit() {
    if (!text || !filename || busy) return
    setBusy(true)
    setOutcome(null)
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, filename, text, mapping }),
      })
      const body = (await response.json().catch(() => ({}))) as CommitResponse & { error?: string }
      if (!response.ok) {
        setOutcome({ tone: 'error', title: 'Nothing was imported', detail: body.error ?? 'The import failed.' })
        return
      }
      if (body.status === 'nothing_to_import') {
        setOutcome({
          tone: 'warn',
          title: 'Nothing new to import',
          detail: 'Every valid row in this file is already in the workspace, or no row passed validation.',
        })
        return
      }
      const noun = kind === 'orders' ? 'order' : 'expense'
      const parts = [
        `${body.written ?? 0} ${noun}${body.written === 1 ? '' : 's'} written` +
          (kind === 'orders' ? ` (${body.linesWritten ?? 0} line${body.linesWritten === 1 ? '' : 's'})` : ''),
      ]
      if (body.skippedExisting) parts.push(`${body.skippedExisting} already present, skipped`)
      if (body.skippedDuplicateInFile) parts.push(`${body.skippedDuplicateInFile} duplicate line${body.skippedDuplicateInFile === 1 ? '' : 's'} in the file, skipped`)
      if (body.errorRows) parts.push(`${body.errorRows} row${body.errorRows === 1 ? '' : 's'} with errors, not written`)
      setOutcome({ tone: 'ok', title: `Imported into ${organizationName}`, detail: parts.join(' · ') + '.' })
      setText(null)
      setFilename(null)
      setMapping({})
      router.refresh()
    } catch {
      setOutcome({ tone: 'error', title: 'Nothing was imported', detail: 'The import could not be sent.' })
    } finally {
      setBusy(false)
    }
  }

  async function rollback(batch: BatchSummary) {
    if (rollingBack) return
    const label = batch.filename ?? 'this batch'
    if (!window.confirm(`Remove every record imported from ${label}? This cannot be undone.`)) return
    setRollingBack(batch.id)
    try {
      const response = await fetch(`/api/import?batch=${encodeURIComponent(batch.id)}`, { method: 'DELETE' })
      const body = (await response.json().catch(() => ({}))) as { removed?: number; error?: string }
      if (!response.ok) {
        setOutcome({ tone: 'error', title: 'Rollback refused', detail: body.error ?? 'The rollback failed.' })
      } else {
        setOutcome({
          tone: 'ok',
          title: 'Rolled back',
          detail: `${body.removed ?? 0} record${body.removed === 1 ? '' : 's'} removed from ${label}.`,
        })
      }
      router.refresh()
    } finally {
      setRollingBack(null)
    }
  }

  const missingRequired = fields.filter((f) => f.required && !mapping[f.key])
  const recordNoun = kind === 'orders' ? 'order' : 'expense'

  return (
    <div className="space-y-6">
      {outcome ? (
        <Panel
          className={
            outcome.tone === 'ok' ? 'border-positive/40' : outcome.tone === 'warn' ? 'border-amber/40' : 'border-negative/40'
          }
        >
          <Eyebrow>{outcome.tone === 'ok' ? 'Done' : outcome.tone === 'warn' ? 'Nothing to do' : 'Not imported'}</Eyebrow>
          <h2 className="text-lg font-semibold">{outcome.title}</h2>
          <p role={outcome.tone === 'error' ? 'alert' : 'status'} className="mt-2 text-sm text-muted">
            {outcome.detail}
          </p>
        </Panel>
      ) : null}

      {/* Step 1 — what and which file */}
      <Panel>
        <Eyebrow>Step 1 · File</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="What the file contains">
          {(Object.keys(IMPORT_KIND_LABELS) as ImportKind[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => chooseKind(option)}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium transition ${
                kind === option
                  ? 'border-signal bg-signal/10 text-ink'
                  : 'border-hairline bg-panelRaised text-muted hover:border-signal hover:text-ink'
              }`}
            >
              {IMPORT_KIND_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {kind === 'orders'
            ? 'One row per line item. Rows that share an order ID become one order.'
            : 'One row per day per campaign, as every ad platform exports it. Counted as ad spend in ROAS and profit.'}
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void acceptFile(file)
          }}
          className={`mt-4 rounded-panel border-2 border-dashed p-8 text-center transition ${
            dragging ? 'border-signal bg-signal/5' : 'border-hairline'
          }`}
        >
          <p className="text-sm text-muted">
            Drag a CSV here, or{' '}
            <label className="cursor-pointer text-signal underline">
              choose a file
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void acceptFile(file)
                  e.target.value = ''
                }}
              />
            </label>
          </p>
          {filename ? <p className="mt-2 text-sm text-ink">{filename}</p> : null}
        </div>

        {readError ? (
          <p role="alert" className="mt-3 text-sm text-negative">
            {readError}
          </p>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-signal">
            What should the file look like?
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-panelRaised p-3 text-xs text-muted">{SAMPLES[kind]}</pre>
          <p className="mt-2 text-xs text-muted">
            Column names do not need to match — you map them in the next step. Amounts without a
            currency column are read as {defaultCurrency}.
          </p>
        </details>
      </Panel>

      {/* Step 2 — mapping */}
      {parsed && parsed.headers.length > 0 ? (
        <Panel>
          <Eyebrow>Step 2 · Map columns</Eyebrow>
          <p className="text-sm text-muted">
            Suggested from your headers. Check them — guessing wrong about which column is revenue
            is not a mistake worth making quietly.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-sm font-medium">
                  {field.label}
                  {field.required ? <span className="text-signal"> *</span> : null}
                </span>
                <select
                  className={inputClass}
                  value={mapping[field.key] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field.key]: e.target.value || null }))
                  }
                >
                  <option value="">— not mapped —</option>
                  {parsed.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                {field.hint ? (
                  <span className="mt-1 block text-xs text-muted">{field.hint}</span>
                ) : null}
              </label>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* Step 3 — preview and commit */}
      {preview && validation ? (
        <Panel>
          <Eyebrow>Step 3 · Preview</Eyebrow>
          <h2 className="text-lg font-semibold">
            {missingRequired.length > 0
              ? 'Map the required columns to continue'
              : `${preview.willImportRecords} ${recordNoun}${preview.willImportRecords === 1 ? '' : 's'} ready to import into ${organizationName}`}
          </h2>

          {missingRequired.length > 0 ? (
            <p className="mt-2 text-sm text-amber">
              Still needed: {missingRequired.map((f) => f.label).join(', ')}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Rows in file', preview.totalRows],
              [kind === 'orders' ? 'Lines to import' : 'Rows to import', preview.willImport],
              ['Duplicates in file', preview.willSkipDuplicateInFile],
              ['Rows with errors', preview.errorRows],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-hairline bg-panelRaised p-3">
                <p className="tabular text-2xl font-semibold">{value as number}</p>
                <p className="text-xs text-muted">{label as string}</p>
              </div>
            ))}
          </div>

          {preview.malformedRows > 0 ? (
            <p className="mt-3 text-sm text-amber">
              {preview.malformedRows} row(s) had the wrong number of columns and were skipped.
            </p>
          ) : null}

          {validation.issues.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-signal">
                {validation.issues.length} issue(s) found
              </summary>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                {validation.issues.slice(0, 100).map((issue, i) => (
                  <li
                    key={i}
                    className={issue.severity === 'error' ? 'text-negative' : 'text-amber'}
                  >
                    Line {issue.line} · {issue.field}: {issue.message}
                    {issue.value ? ` (“${issue.value}”)` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {preview.sample.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-hairline text-left text-muted">
                    <th className="py-2 pr-3">Line</th>
                    {fields
                      .filter((f) => mapping[f.key])
                      .map((f) => (
                        <th key={f.key} className="py-2 pr-3">
                          {f.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row) => (
                    <tr key={row.line} className="border-b border-hairline/60">
                      <td className="py-2 pr-3 text-muted">{row.line}</td>
                      {fields
                        .filter((f) => mapping[f.key])
                        .map((f) => (
                          <td key={f.key} className="py-2 pr-3">
                            {row.values[f.key] || '—'}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || missingRequired.length > 0 || preview.willImport === 0}
              onClick={() => void commit()}
            >
              {busy
                ? 'Importing…'
                : `Import ${preview.willImportRecords} ${recordNoun}${preview.willImportRecords === 1 ? '' : 's'}`}
            </Button>
            <p className="text-xs text-muted">
              {kind === 'orders'
                ? 'Orders already in the workspace are skipped by order ID. The same file is never imported twice.'
                : 'The same file is never imported twice. Spend from an overlapping export is a separate batch you can roll back.'}
            </p>
          </div>
        </Panel>
      ) : null}

      {/* History */}
      <Panel>
        <Eyebrow>Imports</Eyebrow>
        {batches.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing has been imported into this workspace yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline/60">
            {batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {batch.filename ?? 'Untitled file'}{' '}
                    <span className="text-muted">
                      · {IMPORT_KIND_LABELS[batch.kind as ImportKind] ?? batch.kind}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(batch.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {batch.status === 'committed'
                      ? `${batch.rowCount} written`
                      : batch.status === 'rolled_back'
                        ? 'rolled back'
                        : batch.status === 'failed'
                          ? 'failed partway'
                          : batch.status}
                    {batch.skippedCount > 0 ? ` · ${batch.skippedCount} skipped` : ''}
                    {batch.errorCount > 0 ? ` · ${batch.errorCount} with errors` : ''}
                  </p>
                </div>
                {canRollback && (batch.status === 'committed' || batch.status === 'failed') ? (
                  <Button
                    variant="secondary"
                    disabled={rollingBack !== null}
                    onClick={() => void rollback(batch)}
                  >
                    {rollingBack === batch.id ? 'Removing…' : 'Roll back'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
