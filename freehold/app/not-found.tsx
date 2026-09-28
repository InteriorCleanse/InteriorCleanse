import { Cta } from '@/components/Cta'
import { Mark } from '@/components/Mark'

export default function NotFound() {
  return (
    <section className="page pt-20 sm:pt-28 min-h-[60dvh]">
      <Mark size={40} />
      <p className="mono mt-8">404</p>
      <h1 className="mt-4 text-5xl sm:text-7xl max-w-[14ch]">Outside the boundary.</h1>
      <p className="mt-6 text-lg text-stone max-w-[40ch]">There is no page at this address. The front page is the way back in.</p>
      <div className="mt-10">
        <Cta href="/">Front page</Cta>
      </div>
    </section>
  )
}
