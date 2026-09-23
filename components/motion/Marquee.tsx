/**
 * An infinite, seamless marquee band — the editorial ticker that reads as
 * "Framer site" at a glance. Two identical tracks sit end to end and the pair
 * translates by exactly one track width, so the loop has no seam. Pure CSS
 * transform, so it runs on the compositor; it pauses under reduced motion.
 *
 * Decorative, so the whole band is aria-hidden and the words are not announced.
 */
export function Marquee({
  items,
  className = '',
}: {
  items: string[]
  className?: string
}) {
  const track = (
    <ul className="marquee-track" aria-hidden="true">
      {items.map((item, i) => (
        <li key={i} className="marquee-item">
          <span>{item}</span>
          <span className="marquee-dot" aria-hidden="true">
            ✦
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className={`marquee ${className}`.trim()} aria-hidden="true">
      <div className="marquee-inner">
        {track}
        {track}
      </div>
    </div>
  )
}
