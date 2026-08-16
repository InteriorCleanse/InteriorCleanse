import type { Metadata } from 'next'
import { Showroom } from '@/components/showroom/Showroom'
import { showroomProducts } from '@/lib/showroom'

export const metadata: Metadata = {
  title: 'The Collection',
  description:
    'The InteriorCleanse showroom — one object at a time on the stage, or the full catalogue.',
  alternates: { canonical: '/collection/' },
}

export default function Collection({
  searchParams,
}: {
  searchParams?: { category?: string }
}) {
  return (
    <Showroom
      products={showroomProducts()}
      initialCategory={searchParams?.category ?? null}
    />
  )
}
