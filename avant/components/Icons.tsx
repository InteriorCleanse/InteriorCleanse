/**
 * AVANT line icons: one stroke, round joins, currentColor. Kept as a
 * single map so the tab bar, the palette and the cards agree on every glyph.
 */

export type IconName =
  | 'compass'
  | 'trips'
  | 'heart'
  | 'heart-filled'
  | 'key'
  | 'inbox'
  | 'user'
  | 'help'
  | 'search'
  | 'calendar'
  | 'pin'
  | 'star'
  | 'bolt'
  | 'seat'
  | 'gear'
  | 'fuel'
  | 'check'
  | 'x'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'arrow-right'
  | 'filter'
  | 'sun'
  | 'moon'
  | 'command'
  | 'shield'
  | 'truck'
  | 'clock'
  | 'map'
  | 'list'
  | 'plus'
  | 'trash'
  | 'download'
  | 'send'
  | 'sparkle'
  | 'home'
  | 'lock'
  | 'id'
  | 'chat'
  | 'card'
  | 'eye-off'
  | 'camera'

const PATHS: Record<IconName, React.ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5.2-4.8 1.8 2.2-5.2z" />
    </>
  ),
  trips: (
    <>
      <path d="M4 15.5V9a2 2 0 0 1 2-2h2l1.5-2.5h5L16 7h2a2 2 0 0 1 2 2v6.5" />
      <path d="M3 15.5h18v2.5H3z" />
      <circle cx="7.5" cy="18.5" r="1.6" />
      <circle cx="16.5" cy="18.5" r="1.6" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  'heart-filled': <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="currentColor" />,
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 9-9M17 5l2.5 2.5M14.5 7.5 17 10" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.3-3.2 3.8-5 7-5s5.7 1.8 7 5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />,
  bolt: <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z" />,
  seat: (
    <>
      <path d="M7 4h7l1.5 9H8.5z" />
      <path d="M6 13h11l1 5H5zM7 18v2M17 18v2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  fuel: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M3 21h14M7 7h6v4H7zM15 9h2l2 2v6a1.5 1.5 0 0 1-3 0v-4h-1" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  command: (
    <path d="M9 6a3 3 0 1 0-3 3h3zm0 0v12m0-12h6m-6 12a3 3 0 1 1-3-3h3zm0 0h6m0-12a3 3 0 1 1 3 3h-3zm0 0v12m0 0a3 3 0 1 0 3-3h-3zM9 9h6v6H9z" />
  ),
  shield: (
    <>
      <path d="M12 3 5 5.6v5.7c0 4.2 3 6.9 7 8.1 4-1.2 7-3.9 7-8.1V5.6L12 3Z" />
      <path d="M9.2 11.7l2 2 3.6-3.9" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h11v9H3z" />
      <path d="M14 9.5h3.5L21 13v2.5h-7z" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17.5" cy="17.5" r="1.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  send: <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" />,
  sparkle: (
    <path d="M12 3.5c.6 4.4 3.1 6.9 7.5 7.5-4.4.6-6.9 3.1-7.5 7.5-.6-4.4-3.1-6.9-7.5-7.5 4.4-.6 6.9-3.1 7.5-7.5Z" />
  ),
  camera: (
    <>
      <path d="M4 8h3l1.6-2.4A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .8.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  id: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2.2" />
      <path d="M5.8 16c.6-1.5 1.8-2.3 3.2-2.3s2.6.8 3.2 2.3M14 10h4M14 13.5h3" />
    </>
  ),
  chat: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />,
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  'eye-off': <path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.4 3.5M6.2 6.7C4.3 8 3 9.8 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  home: (
    <>
      <path d="m4 11 8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
    </>
  ),
}

export function Icon({
  name,
  size = 20,
  className,
  label,
}: {
  name: IconName
  size?: number
  className?: string
  /** Supplies an accessible name; omit for purely decorative icons. */
  label?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {PATHS[name]}
    </svg>
  )
}
