'use client'

/**
 * Check-in and check-out photos. Each shot is re-encoded on the device
 * (which strips EXIF, including GPS location), fingerprinted with SHA-256,
 * timestamped and kept in this browser. The manifest download lists every
 * fingerprint and is itself fingerprinted, so any later edit is detectable.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ANGLES, buildManifest, coverage, current, sha256Hex, type AngleId, type EvidenceMeta, type EvidencePhase } from '@/lib/evidence'
import { getEvidenceBlob, listEvidence, putEvidence } from '@/lib/evidence-db'
import { shortId } from '@/lib/format'
import { reencodePhoto } from '@/lib/photo'
import { Icon } from './Icons'
import { useToast } from './Toast'

function Thumb({ meta }: { meta: EvidenceMeta }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoke: string | null = null
    void getEvidenceBlob(meta.id).then((b) => {
      if (!b) return
      revoke = URL.createObjectURL(b)
      setUrl(revoke)
    })
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [meta.id])
  return url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null
}

export function EvidenceCapture({ tripId, defaultPhase = 'check-in' }: { tripId: string; defaultPhase?: EvidencePhase }) {
  const toast = useToast()
  const [phase, setPhase] = useState<EvidencePhase>(defaultPhase)
  const [items, setItems] = useState<EvidenceMeta[]>([])
  const [busy, setBusy] = useState<AngleId | null>(null)
  const [ready, setReady] = useState(false)
  const inputs = useRef(new Map<AngleId, HTMLInputElement>())

  const refresh = useCallback(async () => {
    setItems(await listEvidence(tripId))
    setReady(true)
  }, [tripId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const latest = current(items)
  const cov = coverage(latest, phase)

  const add = async (angle: AngleId, file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('That isn’t a photo')
    setBusy(angle)
    try {
      const { blob, width, height } = await reencodePhoto(file)
      const meta: EvidenceMeta = {
        id: shortId('ev'),
        tripId,
        phase,
        angle,
        capturedAt: new Date().toISOString(),
        sha256: await sha256Hex(await blob.arrayBuffer()),
        bytes: blob.size,
        width,
        height,
        type: blob.type,
      }
      await putEvidence(meta, blob)
      await refresh()
      toast(`${ANGLES.find((a) => a.id === angle)?.label} saved`)
    } catch {
      toast('Couldn’t read that photo. Try the camera instead of a file.')
    } finally {
      setBusy(null)
    }
  }

  const downloadManifest = async () => {
    const manifest = await buildManifest(tripId, latest)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }))
    a.download = `avant-evidence-${tripId}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between">
        <div className="segmented" role="group" aria-label="Which photos">
          {(['check-in', 'check-out'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)}>
              {p === 'check-in' ? 'At pickup' : 'At return'}
            </button>
          ))}
        </div>
        <span className="small muted">
          {cov.done.length}/{ANGLES.length} photos
        </span>
      </div>

      <ul className="evidence-grid" aria-label={`${phase} photos`}>
        {ANGLES.map((a) => {
          const shot = latest.find((i) => i.phase === phase && i.angle === a.id)
          return (
            <li key={a.id} className="evidence-slot" data-done={shot ? 'true' : undefined}>
              <button type="button" className="evidence-btn" onClick={() => inputs.current.get(a.id)?.click()} disabled={busy !== null || !ready} aria-label={`${shot ? 'Retake' : 'Take'} ${a.label} photo`}>
                {shot ? <Thumb meta={shot} /> : <Icon name={busy === a.id ? 'clock' : 'plus'} size={22} />}
              </button>
              <span className="evidence-label">
                {shot ? <Icon name="check" size={12} /> : null} {a.label}
              </span>
              {shot ? (
                <span className="evidence-hash" title={shot.sha256}>
                  {new Date(shot.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · #{shot.sha256.slice(0, 8)}
                </span>
              ) : null}
              <input
                ref={(el) => {
                  if (el) inputs.current.set(a.id, el)
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  void add(a.id, e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </li>
          )
        })}
      </ul>

      <div className="between">
        <p className="small dim" style={{ maxWidth: '52ch' }}>
          Photos stay on this phone. Location data is removed, and each one gets a fingerprint and time so nobody can quietly swap it later.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadManifest} disabled={!latest.length}>
          <Icon name="download" size={15} /> Evidence receipt
        </button>
      </div>
    </div>
  )
}
