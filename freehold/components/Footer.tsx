import Link from 'next/link'
import { Mark } from './Mark'
import { SITE } from '@/lib/site'

export function Footer() {
  return (
    <footer className="page mt-24 mb-12">
      <div className="rule pt-8 grid gap-8 sm:grid-cols-3 text-sm">
        <div className="flex items-start gap-3">
          <Mark size={20} className="mt-0.5" />
          <div>
            <p className="wordmark">FREEHOLD</p>
            <p className="text-stone mt-2">{SITE.tagline}</p>
          </div>
        </div>
        <ul className="space-y-2">
          <li><Link href="/build/" className="hover:text-seal">Freehold Build</Link></li>
          <li><Link href="/private/" className="hover:text-seal">Freehold Private</Link></li>
          <li><Link href="/about/" className="hover:text-seal">About</Link></li>
          <li><Link href="/contact/" className="hover:text-seal">Contact</Link></li>
        </ul>
        <ul className="space-y-2 text-stone">
          <li><Link href="/privacy/" className="hover:text-seal">Privacy</Link></li>
          <li><Link href="/terms/" className="hover:text-seal">Terms</Link></li>
          <li><a href={`mailto:${SITE.email}`} className="hover:text-seal">{SITE.email}</a></li>
          <li>&copy; {new Date().getFullYear()} Freehold. A one-person firm, and says so.</li>
        </ul>
      </div>
    </footer>
  )
}
