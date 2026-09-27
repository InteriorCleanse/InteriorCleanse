export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className="measure">
      {items.map((it, i) => (
        <div key={it.q} className="rule py-6 rv" data-i={i}>
          <dt className="serif text-2xl">{it.q}</dt>
          <dd className="text-stone mt-3">{it.a}</dd>
        </div>
      ))}
    </dl>
  )
}
