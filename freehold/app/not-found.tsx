import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="page pt-20">
      <p className="kicker">404</p>
      <h1 className="mt-4 text-5xl">No such page.</h1>
      <p className="mt-6 text-stone">
        <Link className="link" href="/">Back to the front page</Link>
      </p>
    </section>
  )
}
