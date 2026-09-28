import Link from 'next/link'
import { Mark } from './Mark'
import { NAV, SITE } from '@/lib/site'

export function Header() {
  return (
    <header className="page">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-5 sm:py-6 border-b border-hairline">
        <Link href="/" className="flex items-center gap-3 py-1" aria-label={`${SITE.name}, home`}>
          <Mark size={22} />
          <span className="wordmark">FREEHOLD</span>
        </Link>
        <nav aria-label="Primary" className="basis-full sm:basis-auto">
          <ul className="flex items-center gap-6 sm:gap-9 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="navlink inline-block py-2 hover:text-ink transition-colors duration-500 ease-out">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
