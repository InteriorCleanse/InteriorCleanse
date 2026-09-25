'use client'

import { useMemo, useState } from 'react'
import {
  buildPreview,
  type FieldSpec,
  parseCsv,
  type ParseResult,
  suggestMapping,
  validateRows,
} from '@/lib/import/csv'
import { Button, Eyebrow, Panel, inputClass } from '@/components/ui'

/**
 * Drag-and-drop → mapping → validation → preview.
 *
 * All four steps run against the same pure functions the server will use, so
 * what the operator approves is exactly what gets written. Existing external
 * ids are not known client-side yet, so "already imported" is resolved at
 * commit time; the preview says so rather than implying a count it cannot know.
 */
export function ImportWizard({
  fields,
  defaultCurrency,
  organizationName,
}: {
  fields: FieldSpec[]
  defaultCurrency: string
  organizationName: string
}) {
  const [filename, setFilename] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [dragging, setDragging] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)

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

  async function acceptFile(file: File) {
    setReadError(null)
    if (file.size > 20 * 1024 * 1024) {
      setReadError('That file is larger than 20 MB. Split it and import in parts.')
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

  const missingRequired = fields.filter((f) => f.required && !mapping[f.key])

  return (
    <div className="space-y-6">
      {/* Step 1 — file */}
      <Panel>
        <Eyebrow>Step 1 · File</Eyebrow>
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
          className={`mt-2 rounded-panel border-2 border-dashed p-8 text-center transition ${
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
          <pre className="mt-2 overflow-x-auto rounded-lg bg-panelRaised p-3 text-xs text-muted">
{`order id,date,product,qty,total,discount
1001,2026-01-05,Amber Candle,2,68.00,6.80
1002,2026-01-06,Canvas Tote,1,28.00,0.00`}
          </pre>
          <p className="mt-2 text-xs text-muted">
            Column names do not need to match — you map them in the next step.
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

      {/* Step 3 — preview */}
      {preview && validation ? (
        <Panel>
          <Eyebrow>Step 3 · Preview</Eyebrow>
          <h2 className="text-lg font-semibold">
            {missingRequired.length > 0
              ? 'Map the required columns to continue'
              : `${preview.willImport} row${preview.willImport === 1 ? '' : 's'} ready to import into ${organizationName}`}
          </h2>

          {missingRequired.length > 0 ? (
            <p className="mt-2 text-sm text-amber">
              Still needed: {missingRequired.map((f) => f.label).join(', ')}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Rows in file', preview.totalRows],
              ['Will import', preview.willImport],
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
            <Button disabled={missingRequired.length > 0 || preview.willImport === 0}>
              Import {preview.willImport} row{preview.willImport === 1 ? '' : 's'}
            </Button>
            <p className="text-xs text-muted">
              Commit writes to the database and is wired in the next slice. Rows already imported
              are skipped at that point by external id.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
