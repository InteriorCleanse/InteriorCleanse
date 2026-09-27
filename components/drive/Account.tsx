'use client'

/**
 * Preferences and the data on this device. No account exists; this is the
 * honest version of a settings screen: what is stored, where, and how to
 * take it with you or wipe it.
 */

import { useRef, useState } from 'react'
import { cities } from '@/lib/drive/data'
import { exportDriveState, useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Theme, Units } from '@/lib/drive/types'
import { useToast } from './Toast'
import { Button, Field, Segmented } from './ui'

export function AccountSettings() {
  const { prefs, favorites, trips, listings, threads, hydrated } = useDriveState()
  const { setPrefs, clearAll, importAll } = useDriveActions()
  const toast = useToast()
  const [confirmClear, setConfirmClear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!hydrated) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />

  const exportData = () => {
    const blob = new Blob([JSON.stringify(exportDriveState(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drive-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Exported')
  }

  const importData = async (file: File | undefined) => {
    if (!file) return
    try {
      importAll(JSON.parse(await file.text()))
      toast('Imported')
    } catch {
      toast('That file is not a Drive export')
    }
  }

  return (
    <div className="dr-account">
      <section className="dr-panel" aria-labelledby="dr-acct-you">
        <h2 id="dr-acct-you" className="dr-h2">
          You
        </h2>
        <div className="dr-grid-2">
          <Field label="Name" hint="Pre-fills the driver’s name at booking.">
            {(p) => <input {...p} type="text" value={prefs.name} onChange={(e) => setPrefs({ name: e.target.value })} autoComplete="name" />}
          </Field>
          <Field label="Home city" hint="Pre-selected when you search.">
            {(p) => (
              <select {...p} value={prefs.homeCity} onChange={(e) => setPrefs({ homeCity: e.target.value })}>
                <option value="">None</option>
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}, {c.state}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </section>

      <section className="dr-panel" aria-labelledby="dr-acct-display">
        <h2 id="dr-acct-display" className="dr-h2">
          Display
        </h2>
        <div className="dr-grid-2">
          <div className="dr-field">
            <span className="dr-label">Theme</span>
            <Segmented<Theme>
              label="Theme"
              value={prefs.theme}
              options={[
                { id: 'system', label: 'System' },
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
              ]}
              onChange={(theme) => setPrefs({ theme })}
            />
          </div>
          <div className="dr-field">
            <span className="dr-label">Distance</span>
            <Segmented<Units>
              label="Distance units"
              value={prefs.units}
              options={[
                { id: 'mi', label: 'Miles' },
                { id: 'km', label: 'Kilometres' },
              ]}
              onChange={(units) => setPrefs({ units })}
            />
          </div>
        </div>
      </section>

      <section className="dr-panel" aria-labelledby="dr-acct-data">
        <h2 id="dr-acct-data" className="dr-h2">
          Your data
        </h2>
        <p className="dr-muted">
          Drive has no account and no server. Everything below is stored in this browser only, and nothing leaves it unless you export
          it.
        </p>
        <dl className="dr-summary">
          <div>
            <dt>Saved cars</dt>
            <dd>{favorites.length}</dd>
          </div>
          <div>
            <dt>Trips</dt>
            <dd>{trips.length}</dd>
          </div>
          <div>
            <dt>Listings</dt>
            <dd>{listings.length}</dd>
          </div>
          <div>
            <dt>Conversations</dt>
            <dd>{threads.length}</dd>
          </div>
        </dl>
        <div className="dr-row">
          <Button variant="secondary" icon="download" onClick={exportData}>
            Export as JSON
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import a file
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="dr-visually-hidden" onChange={(e) => importData(e.target.files?.[0])} aria-label="Import Drive data" />
          {!confirmClear ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmClear(true)}>
              Clear everything
            </Button>
          ) : (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  clearAll()
                  setConfirmClear(false)
                  toast('Cleared')
                }}
              >
                Yes, clear it all
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Keep it
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
