'use client'

import { useEffect, useState } from 'react'
import { THEMES, THEME_STORAGE_KEY, normalizeTheme, type ThemeValue } from '@/lib/theme'

/**
 * A three-way theme control for the header.
 *
 * It changes the look by setting `data-theme` on the document element, the
 * same attribute the no-flash bootstrap sets on load, and remembers the
 * choice in localStorage so the next visit opens the same way. Nothing about
 * the theme touches the server or another viewer — it is a per-browser
 * preference, so storage is the right home and a failed write is harmless.
 *
 * The active state is resolved after mount from the attribute already on the
 * page, so the server-rendered markup carries no theme-specific state and
 * there is no hydration mismatch.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeValue | null>(null)

  // Read the active theme once, after paint. Server and first client render
  // both carry no active state (theme is null), so hydration matches; the
  // read is deferred a frame so it does not set state during the commit.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setTheme(normalizeTheme(document.documentElement.getAttribute('data-theme'))),
    )
    return () => cancelAnimationFrame(id)
  }, [])

  const choose = (value: ThemeValue) => {
    document.documentElement.setAttribute('data-theme', value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // A private window can refuse storage; the live change still applies for
      // this session, which is the part the viewer sees.
    }
    setTheme(value)
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center rounded-full border border-hairline bg-panelRaised p-0.5"
    >
      {THEMES.map((option) => {
        const active = theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              active ? 'bg-signal font-medium text-ground' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
