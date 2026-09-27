import type { ReactNode } from 'react'

export function Section({
  n,
  title,
  children,
  id,
}: {
  n: string
  title: string
  children: ReactNode
  id?: string
}) {
  return (
    <section id={id} className="page mt-20 sm:mt-28 reveal" aria-labelledby={`s-${n}`}>
      <div className="rule pt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <p className="kicker">{n}</p>
          <h2 id={`s-${n}`} className="text-3xl sm:text-4xl mt-2">
            {title}
          </h2>
        </div>
        <div className="lg:col-span-9 lg:pl-8">{children}</div>
      </div>
    </section>
  )
}
