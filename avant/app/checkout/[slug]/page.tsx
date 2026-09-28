import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Checkout } from '@/components/Checkout'
import { carTitle, getCar } from '@/lib/data'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const car = getCar((await params).slug)
  return { title: car ? `Checkout: ${carTitle(car)}` : 'Checkout', robots: { index: false } }
}

export default async function CheckoutPage({ params }: Props) {
  const car = getCar((await params).slug)
  if (!car) notFound()
  return (
    <Suspense fallback={<div className="wrap page"><div className="skeleton" /></div>}>
      <Checkout car={car} />
    </Suspense>
  )
}
