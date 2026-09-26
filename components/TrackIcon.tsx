import { LineIcon } from './icons/LineIcon'

export type TrackIconName = 'book' | 'sparkle' | 'flame' | 'star' | 'diamond'

/**
 * The small mark that heads each brand track: a line glyph seated in a thin
 * ring, in the room's own colour. Static SVG in the server HTML — it paints
 * with the page, needs no runtime, and never falls back to a stray glyph.
 */
export function TrackIcon({ name, size = 16 }: { name: TrackIconName; size?: number }) {
  return (
    <span className="track-icon" aria-hidden="true">
      <LineIcon name={name} size={size} />
    </span>
  )
}
