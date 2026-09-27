import type { Metadata } from 'next'
import Link from 'next/link'
import { CarCard } from '@/components/drive/CarCard'
import { RecentlyViewed } from '@/components/drive/HomeExtras'
import { Icon } from '@/components/drive/Icons'
import { SearchBar } from '@/components/drive/SearchBar'
import { Button, SectionTitle } from '@/components/drive/ui'
import { BODY_TYPES } from '@/lib/drive/catalog'
import { DRIVE_TAGLINE } from '@/lib/drive/config'
import { carCountByBody, cars, cities, featuredCars } from '@/lib/drive/data'
import { DRIVE } from '@/lib/drive/routes'
import { searchHref } from '@/lib/drive/search'

export const metadata: Metadata = {
  title: 'Drive — book the exact car you want',
  description: `${DRIVE_TAGLINE} Search ${cars.length} cars across ${cities.length} cities, see the whole price up front, and book in four steps.`,
  alternates: { canonical: DRIVE.home },
}

const WHY: { icon: 'search' | 'command' | 'shield' | 'bolt' | 'user' | 'map'; title: string; body: string }[] = [
  { icon: 'search', title: 'Results, instantly', body: 'The fleet is searched on your device. Filters apply as you tap them and every search is a link you can share.' },
  { icon: 'shield', title: 'The whole price, first', body: 'Fees, protection and taxes are itemised before you commit, with a one-line reason for each.' },
  { icon: 'command', title: 'Everything one keystroke away', body: 'Press ⌘K for the palette, or g then a letter to jump between sections. Five tabs on a phone.' },
  { icon: 'user', title: 'No account to make', body: 'Search, save, book and message without signing in. Your data stays in your browser; export it whenever you like.' },
  { icon: 'bolt', title: 'Instant book, marked clearly', body: 'The bolt badge means the booking confirms the moment you tap. Everything else says how long the host takes.' },
  { icon: 'map', title: 'A map that answers the question', body: 'Pins show the price, and hovering a card lights up its pin. No third-party tiles, nothing to block.' },
]

export default function DriveHome() {
  const featured = featuredCars()
  const counts = carCountByBody()
  return (
    <>
      <section className="dr-hero">
        <div className="dr-hero-inner">
          <p className="dr-eyebrow">Peer-to-peer car sharing</p>
          <h1 className="dr-hero-title">
            Book the exact car you want,
            <br />
            <em>from a neighbour.</em>
          </h1>
          <p className="dr-hero-sub">
            {cars.length} cars in {cities.length} cities. Pick the dates, see the full price, and drive. No counter, no queue, no account.
          </p>
          <SearchBar />
        </div>
      </section>

      <section className="dr-section" aria-labelledby="dr-types">
        <SectionTitle title={<span id="dr-types">Browse by type</span>} sub="Every type in the fleet, with how many are listed." />
        <ul className="dr-types">
          {BODY_TYPES.map((b) => (
            <li key={b.id}>
              <Link href={searchHref({ bodies: [b.id] })} className="dr-type">
                <strong>{b.label}</strong>
                <span>{b.blurb}</span>
                <small>{counts[b.id] ?? 0} listed</small>
                <Icon name="arrow-right" size={16} className="dr-type-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <RecentlyViewed />

      <section className="dr-section" aria-labelledby="dr-featured">
        <SectionTitle
          title={<span id="dr-featured">Top rated, city by city</span>}
          sub="The best-reviewed car in each city right now."
          action={
            <Button variant="ghost" href={searchHref({ sort: 'rating' })} iconAfter="arrow-right">
              All top rated
            </Button>
          }
        />
        <div className="dr-cargrid">
          {featured.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </div>
      </section>

      <section className="dr-section" aria-labelledby="dr-how">
        <SectionTitle title={<span id="dr-how">How it works</span>} />
        <ol className="dr-how">
          <li>
            <span className="dr-how-num">1</span>
            <h3>Search</h3>
            <p>City and dates, or just a word like “convertible”. Filters narrow the list as you tap them.</p>
          </li>
          <li>
            <span className="dr-how-num">2</span>
            <h3>Book in four steps</h3>
            <p>Dates, protection, extras, one last look. The total is on screen the whole time.</p>
          </li>
          <li>
            <span className="dr-how-num">3</span>
            <h3>Pick up and go</h3>
            <p>The trip page carries your check-in list, receipt, calendar file and the thread with your host.</p>
          </li>
        </ol>
      </section>

      <section className="dr-section" aria-labelledby="dr-why">
        <SectionTitle title={<span id="dr-why">Built to be easy to reach</span>} sub="What is different about this one." />
        <ul className="dr-why">
          {WHY.map((w) => (
            <li key={w.title}>
              <span className="dr-why-icon">
                <Icon name={w.icon} size={20} />
              </span>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="dr-section">
        <div className="dr-cta">
          <div>
            <p className="dr-eyebrow">Hosting</p>
            <h2>Your car could pay for itself.</h2>
            <p>See what similar cars earn in your city, then list yours in four steps.</p>
          </div>
          <Button href={DRIVE.host} size="lg" iconAfter="arrow-right" variant="secondary">
            Estimate earnings
          </Button>
        </div>
      </section>
    </>
  )
}
