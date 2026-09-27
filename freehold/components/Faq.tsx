export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className="measure">
      {items.map((it) => (
        <div key={it.q} className="rule py-5">
          <dt className="font-medium">{it.q}</dt>
          <dd className="text-stone mt-2">{it.a}</dd>
        </div>
      ))}
    </dl>
  )
}
