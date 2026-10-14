'use client'

import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { switchWorkspace } from '@/app/app/workspace-actions'

/**
 * The business picker in the header. A plain form, so it works without
 * JavaScript; with it, choosing a business submits at once. The current page
 * is kept, so switching from Revenue lands on the other business's Revenue.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: { id: string; name: string; isDemo: boolean }[]
  activeId: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const pathname = usePathname()

  return (
    <form ref={form} action={switchWorkspace} className="flex items-center gap-2">
      <input type="hidden" name="returnTo" value={pathname ?? '/app/command-center'} />
      <label className="sr-only" htmlFor="workspace-switcher">
        Business
      </label>
      <select
        id="workspace-switcher"
        name="organizationId"
        defaultValue={activeId}
        onChange={() => form.current?.requestSubmit()}
        className="max-w-[14rem] truncate rounded-lg border border-hairline bg-panelRaised px-2 py-1.5 text-sm text-ink outline-none transition focus:border-signal"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.isDemo ? ' (demo)' : ''}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm text-signal">
          Switch
        </button>
      </noscript>
    </form>
  )
}
