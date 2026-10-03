'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useConcierge } from './Concierge'
import { useDriver } from './DriverProvider'
import { Icon, type IconName } from './Icons'
import { useSession } from './Session'
import { useToast } from './Toast'
import { Avatar } from './ui'

function Item({ href, icon, label, note }: { href: string; icon: IconName; label: string; note?: string }) {
  return (
    <li>
      <Link href={href}>
        <Icon name={icon} size={20} />
        <span>
          {label}
          {note ? <span className="small muted" style={{ display: 'block' }}>{note}</span> : null}
        </span>
        <Icon name="chevron-right" size={18} />
      </Link>
    </li>
  )
}

export function More() {
  const { user, loaded, signOut } = useSession()
  const { facts, refresh } = useDriver()
  const { setOpen } = useConcierge()
  const router = useRouter()
  const toast = useToast()

  return (
    <div>
      {loaded && user ? (
        <Link href="/account" className="profile-head">
          <Avatar name={user.name} photo={user.photo} size={72} />
          <span>
            <strong style={{ fontSize: '1.4rem', fontWeight: 500, display: 'block' }}>{user.name}</strong>
            <span className="muted">View and edit profile</span>
          </span>
        </Link>
      ) : loaded ? (
        <div className="profile-head" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 300 }}>Your AVANT</h2>
          <p className="muted">Sign in to book, keep favorites everywhere and message hosts.</p>
          <div className="row">
            <Link href="/signin" className="btn btn-primary btn-md">
              Sign in
            </Link>
            <Link href="/signin?mode=up" className="btn btn-secondary btn-md">
              Create account
            </Link>
          </div>
        </div>
      ) : (
        <div className="skeleton" style={{ minHeight: 90 }} />
      )}

      <p className="menu-title">Account</p>
      <ul className="menu">
        <Item href="/verify" icon="id" label="Driver Pass" note={facts.verified ? 'Verified' : 'Verify your licence once to book'} />
        <Item href="/account" icon="user" label="Profile and privacy" />
      </ul>

      <p className="menu-title">Hosting</p>
      <ul className="menu">
        <Item href="/host/new" icon="plus" label="List your car" />
        <Item href="/host/listings" icon="key" label="Your listings" note="Edit price, photos and calendar" />
        <Item href="/host/earnings" icon="card" label="Earnings and payouts" />
        <Item href="/host" icon="sparkle" label="What you could earn" />
      </ul>

      <p className="menu-title">Help</p>
      <ul className="menu">
        <li>
          <button type="button" onClick={() => setOpen(true)}>
            <Icon name="sparkle" size={20} />
            <span>Ask AVANT, any time</span>
            <Icon name="chevron-right" size={18} />
          </button>
        </li>
        <Item href="/coverage" icon="shield" label="Protection, explained" />
        <Item href="/security" icon="lock" label="Trust and safety" />
      </ul>

      <p className="menu-title">Legal</p>
      <ul className="menu">
        <Item href="/legal/terms" icon="list" label="Terms" />
        <Item href="/legal/privacy" icon="eye-off" label="Privacy" />
      </ul>

      {user ? (
        <ul className="menu">
          <li>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                await refresh()
                toast('Signed out')
                router.push('/')
              }}
            >
              <Icon name="x" size={20} />
              <span>Sign out</span>
              <span />
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
