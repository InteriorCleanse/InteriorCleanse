import Link from 'next/link'
import { Mark } from './Mark'
import { SITE } from '@/lib/site'

export function Footer() {
  return (
    <footer className="page mt-32 mb-12">
      <div className="rule pt-10 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr] text-sm">
        <div className="flex items-start gap-3">
          <Mark size={22} className="mt-0.5" />
          <div>
            <p className="wordmark">FREEHOLD</p>
            <p className="text-stone mt-3 max-w-xs">{SITE.tagline} A one-person firm, and says so.</p>
          </div>
        </div>
        <ul className="space-y-2">
          <li><Link href="/build/" className="hover:text-ink">Freehold Build</Link></li>
          <li><Link href="/private/" className="hover:text-ink">Freehold Private</Link></li>
          <li><Link href="/about/" className="hover:text-ink">About</Link></li>
          <li><Link href="/contact/" className="hover:text-ink">Contact</Link></li>
        </ul>
        <ul className="space-y-2 text-stone">
          <li><a href={`mailto:${SITE.email}`} className="hover:text-ink">{SITE.email}</a></li>
          <li><Link href="/privacy/" className="hover:text-ink">Privacy</Link></li>
          <li><Link href="/terms/" className="hover:text-ink">Terms</Link></li>
          <li>&copy; {new Date().getFullYear()} Freehold</li>
        </ul>
      </div>
    </footer>
  )
}
