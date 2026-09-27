'use client'

/**
 * The frame every Drive screen sits in: a top bar on wide screens, a tab bar
 * on phones, the command palette, the keyboard chords and the theme.
 *
 * Navigation rules it enforces:
 *   - the five primary destinations are always one tap away;
 *   - ⌘K (or Ctrl-K) opens the palette from anywhere, `/` too unless typing;
 *   - `g` followed by a letter jumps to a section without touching the mouse;
 *   - the current section is marked with aria-current, not just a colour.
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DRIVE_NAME } from '@/lib/drive/config'
import { DRIVE, PRIMARY_NAV, SECONDARY_NAV, isActive } from '@/lib/drive/routes'
import { DriveProvider, useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Theme } from '@/lib/drive/types'
import { CommandPalette, type PaletteAction } from './CommandPalette'
import { Icon } from './Icons'
import { ToastProvider, useToast } from './Toast'
import { Kbd } from './ui'

const THEME_ORDER: Theme[] = ['system', 'light', 'dark']

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? DRIVE.home
  const router = useRouter()
  const { prefs, trips, threads, hydrated } = useDriveState()
  const { setPrefs } = useDriveActions()
  const toast = useToast()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const chord = useRef<number | null>(null)

  const upcoming = useMemo(() => trips.filter((t) => t.status === 'booked').length, [trips])
  const unread = useMemo(() => threads.filter((t) => t.messages[t.messages.length - 1]?.from === 'host').length, [threads])

  const cycleTheme = useCallback(() => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length]
    setPrefs({ theme: next })
    toast(`Theme: ${next}`)
  }, [prefs.theme, setPrefs, toast])

  // Global keys. Chords are `g` then a letter within a second.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || paletteOpen) return
      if (e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (e.key === '?') {
        router.push(`${DRIVE.help}#shortcuts`)
        return
      }
      if (chord.current !== null) {
        window.clearTimeout(chord.current)
        chord.current = null
        const key = e.key.toLowerCase()
        if (key === 'h' && e.shiftKey === false) {
          router.push(DRIVE.host)
          return
        }
        const target = [...PRIMARY_NAV, ...SECONDARY_NAV].find((n) => n.key === key)
        if (target) router.push(target.href)
        else if (key === 'd') router.push(DRIVE.home)
        return
      }
      if (e.key === 'g') {
        chord.current = window.setTimeout(() => {
          chord.current = null
        }, 1000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, router])

  const actions = useMemo<PaletteAction[]>(
    () => [
      { id: 'theme', label: 'Switch theme', hint: prefs.theme, icon: prefs.theme === 'dark' ? 'sun' : 'moon', run: cycleTheme },
    ],
    [prefs.theme, cycleTheme],
  )

  return (
    <div className="drive-root" data-theme={hydrated ? prefs.theme : 'system'}>
      <header className="dr-topbar">
        <div className="dr-topbar-inner">
          <Link href={DRIVE.home} className="dr-brand" aria-label={`${DRIVE_NAME} home`}>
            <span className="dr-brand-mark" aria-hidden="true">
              <Icon name="key" size={18} />
            </span>
            <span className="dr-brand-name">{DRIVE_NAME}</span>
          </Link>

          <nav className="dr-topnav" aria-label="Drive sections">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item)
              const count = item.href === DRIVE.trips ? upcoming : item.href === DRIVE.inbox ? unread : 0
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                  <Icon name={item.icon} size={17} />
                  <span>{item.label}</span>
                  {count > 0 ? <span className="dr-nav-count">{count}</span> : null}
                </Link>
              )
            })}
          </nav>

          <div className="dr-topbar-actions">
            <button type="button" className="dr-palette-trigger" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={16} />
              <span>Jump to…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <button type="button" className="dr-icon-btn" onClick={cycleTheme} aria-label={`Theme: ${prefs.theme}. Switch theme`}>
              <Icon name={prefs.theme === 'dark' ? 'sun' : prefs.theme === 'light' ? 'moon' : 'sparkle'} size={18} />
            </button>
            <Link
              href={DRIVE.account}
              className="dr-icon-btn"
              aria-label="Account"
              aria-current={pathname.startsWith(DRIVE.account) ? 'page' : undefined}
            >
              <Icon name="user" size={18} />
            </Link>
          </div>
        </div>
      </header>

      <div className="dr-main">{children}</div>

      <footer className="dr-foot">
        <p>
          <strong>{DRIVE_NAME}</strong> runs on a sample fleet. Every car, host and review is generated for the demonstration and
          nothing is bought or charged.
        </p>
        <p>
          <Link href={DRIVE.help}>Help</Link> · <Link href={DRIVE.account}>Account</Link> · <Link href="/">Back to InteriorCleanse</Link>
        </p>
      </footer>

      <nav className="dr-tabbar" aria-label="Drive sections">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item)
          const count = item.href === DRIVE.trips ? upcoming : item.href === DRIVE.inbox ? unread : 0
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
              <span className="dr-tab-icon">
                <Icon name={item.icon} size={22} />
                {count > 0 ? <span className="dr-tab-count">{count}</span> : null}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />
    </div>
  )
}

export function DriveShell({ children }: { children: ReactNode }) {
  return (
    <DriveProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </DriveProvider>
  )
}
