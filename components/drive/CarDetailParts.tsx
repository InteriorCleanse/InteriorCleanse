'use client'

/**
 * The client-side pieces of a car page: the save button in the title row,
 * "message host" (which opens or creates a thread) and the reviews list with
 * its show-more.
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatDate } from '@/lib/drive/dates'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveActions } from '@/lib/drive/store'
import type { Car, Host, Review } from '@/lib/drive/types'
import { SaveButton } from './CarCard'
import { Icon } from './Icons'
import { Avatar, Button, Stars } from './ui'

export function CarTitleActions({ car }: { car: Car }) {
  return (
    <div className="dr-title-actions">
      <button
        type="button"
        className="dr-save dr-save-labelled"
        onClick={async () => {
          const url = window.location.href
          try {
            if (navigator.share) await navigator.share({ title: document.title, url })
            else await navigator.clipboard.writeText(url)
          } catch {
            /* the visitor dismissed the share sheet */
          }
        }}
      >
        <Icon name="send" size={16} />
        <span>Share</span>
      </button>
      <SaveButton car={car} labelled />
    </div>
  )
}

export function MessageHostButton({ car, host }: { car: Car; host: Host }) {
  const { openThread } = useDriveActions()
  const router = useRouter()
  return (
    <Button
      variant="secondary"
      icon="inbox"
      onClick={() => {
        const thread = openThread(car.id, host.id)
        router.push(DRIVE.thread(thread.id))
      }}
    >
      Message {host.name.split(' ')[0]}
    </Button>
  )
}

export function Reviews({ reviews }: { reviews: Review[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? reviews : reviews.slice(0, 3)
  return (
    <div className="dr-reviews">
      <ul>
        {shown.map((r) => (
          <li key={r.id} className="dr-review">
            <div className="dr-review-head">
              <Avatar name={r.author} size={34} />
              <div>
                <strong>{r.author}</strong>
                <span>{formatDate(r.date, true)}</span>
              </div>
              <Stars value={r.rating} />
            </div>
            <p>{r.text}</p>
          </li>
        ))}
      </ul>
      {reviews.length > 3 && !all ? (
        <Button variant="ghost" onClick={() => setAll(true)}>
          Show all {reviews.length} reviews
        </Button>
      ) : null}
    </div>
  )
}
