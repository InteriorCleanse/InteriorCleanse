'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACTION_COMMANDS, filterCommands, navCommands, type Command } from '@/lib/commands'
import { THEME_STORAGE_KEY, type ThemeValue } from '@/lib/theme'

/**
 * The command palette: Cmd/Ctrl-K to jump anywhere, switch theme, or open the
 * assistant. The matching lives in `lib/commands.ts` and is unit-tested; this
 * component is the shell — keyboard handling, focus, and running the choice.
 *
 * It carries no data of its own beyond the nav it is handed, and every action
 * is something the user could already do by clicking; the palette only makes
 * it faster.
 */
export function CommandPalette({ nav }: { nav: readonly { href: string; label: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo(() => [...navCommands(nav), ...ACTION_COMMANDS], [nav])
  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  const openPalette = useCallback(() => {
    setQuery('')
    setActive(0)
    setOpen(true)
  }, [])

  // Cmd/Ctrl-K toggles; Escape closes. Also opens on a header-hint event.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) setOpen(false)
        else openPalette()
      } else if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    const onHint = () => openPalette()
    window.addEventListener('keydown', onKey)
    window.addEventListener('aurelis:open-command', onHint)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('aurelis:open-command', onHint)
    }
  }, [open, openPalette])

  // Focus the input a frame after opening — deferred so no state is set during
  // the commit that opened it.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const run = useCallback(
    (command: Command | undefined) => {
      if (!command) return
      setOpen(false)
      if (command.href) {
        router.push(command.href)
        return
      }
      if (command.action === 'assistant') {
        window.dispatchEvent(new CustomEvent('aurelis:open-assistant'))
        return
      }
      if (command.action?.startsWith('theme:')) {
        const theme = command.action.slice('theme:'.length) as ThemeValue
        document.documentElement.setAttribute('data-theme', theme)
        try {
          localStorage.setItem(THEME_STORAGE_KEY, theme)
        } catch {
          // A private window can refuse storage; the live change still applies.
        }
      }
    },
    [router],
  )

  if (!open) return null

  const activeIndex = Math.min(active, Math.max(0, results.length - 1))

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[activeIndex])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-panel border border-signal/30 bg-panel shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onInputKey}
          placeholder="Jump to, switch theme, ask the assistant…"
          aria-label="Command"
          className="w-full border-b border-hairline bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-muted"
        />
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted">Nothing matches that.</li>
          ) : (
            results.map((command, index) => (
              <li key={command.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(command)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                    index === activeIndex ? 'bg-signal/15 text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  <span className="truncate">{command.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted">
                    {command.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
