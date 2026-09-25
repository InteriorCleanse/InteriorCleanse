'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, ButtonLink } from '@/components/ui'

/**
 * Obsidian, both directions, on one card.
 *
 * Export is a plain link: the route streams a zip and the browser saves it.
 * Upload is a form that reports what happened per file — a note skipped for
 * being too large is a fact the person needs, not a silent omission.
 */
export function ObsidianPanel({ canImport }: { canImport: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'uploading'>('idle')
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setState('uploading')
    setMessage(null)

    const form = new FormData()
    for (const file of Array.from(files)) form.append('files', file)

    try {
      const response = await fetch('/api/knowledge/upload', { method: 'POST', body: form })
      const body = (await response.json().catch(() => ({}))) as {
        imported?: number
        skipped?: { file: string; reason: string }[]
        error?: string
      }
      if (!response.ok) {
        setMessage({ tone: 'bad', text: body.error ?? 'The upload failed.' })
        return
      }
      const skipped = body.skipped ?? []
      setMessage({
        tone: skipped.length > 0 ? 'warn' : 'ok',
        text:
          `${body.imported ?? 0} note${body.imported === 1 ? '' : 's'} added to the knowledge base.` +
          (skipped.length > 0
            ? ` Skipped: ${skipped.map((s) => `${s.file} (${s.reason})`).join('; ')}`
            : ''),
      })
      router.refresh()
    } catch {
      setMessage({ tone: 'bad', text: 'The request did not complete.' })
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/api/knowledge/obsidian" variant="secondary">
          Download vault bundle
        </ButtonLink>
        <span className="text-xs text-muted">
          A zip of briefings, alerts and knowledge with Dataview-ready frontmatter. A snapshot —
          export again for a newer one.
        </span>
      </div>

      {canImport ? (
        <label className="block text-xs text-muted">
          Upload notes from your vault as knowledge (.md, up to 50 at a time)
          <input
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            disabled={state === 'uploading'}
            className="mt-1 block text-sm text-ink file:mr-3 file:rounded-panel file:border file:border-hairline file:bg-panel file:px-3 file:py-1.5 file:text-sm file:text-ink"
            onChange={(event) => void upload(event.target.files)}
          />
        </label>
      ) : null}

      {state === 'uploading' ? (
        <Button variant="secondary" disabled>
          Uploading…
        </Button>
      ) : null}

      {message ? (
        <p
          role="status"
          className={`text-xs ${
            message.tone === 'ok' ? 'text-positive' : message.tone === 'warn' ? 'text-amber' : 'text-negative'
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
