import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BookingFlowFromUrl } from '@/components/drive/BookingFlowFromUrl'
import { carTitle, cars, getCar } from '@/lib/drive/data'
import { DRIVE } from '@/lib/drive/routes'

export function generateStaticParams() {
  return cars.map((c) => ({ slug: c.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const car = getCar(params.slug)
  if (!car) return {}
  return {
    title: `Book the ${carTitle(car)}`,
    description: `Four short steps to book the ${carTitle(car)}: dates, protection, extras and a final check, with the full price shown throughout.`,
    alternates: { canonical: DRIVE.book(car.slug) },
    robots: { index: false, follow: false },
  }
}

export default function BookPage({ params }: { params: { slug: string } }) {
  const car = getCar(params.slug)
  if (!car) notFound()
  return (
    <div className="dr-container">
      <h1 className="dr-visually-hidden">Book the {carTitle(car)}</h1>
      <Suspense fallback={<div className="dr-skeleton dr-skeleton-block" aria-busy="true" />}>
        <BookingFlowFromUrl car={car} />
      </Suspense>
    </div>
  )
}
