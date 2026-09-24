'use client'

/**
 * The header affordance that tells people the palette exists and opens it on
 * click. It only dispatches an event; the palette owns the state, so there is
 * one source of truth for whether the palette is open.
 */
export function CommandHint() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('aurelis:open-command'))}
      className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-panelRaised px-2.5 py-1 text-xs text-muted transition hover:border-signal hover:text-ink"
      aria-label="Open command palette"
      title="Command palette"
    >
      <span aria-hidden="true">⌘K</span>
    </button>
  )
}
