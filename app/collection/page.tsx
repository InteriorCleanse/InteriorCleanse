import type { Metadata } from 'next'
import { Showroom } from '@/components/showroom/Showroom'
import { getScene } from '@/lib/scenes'
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
  searchParams?: { category?: string; view?: string; q?: string; sort?: string }
}) {
  return (
    <Showroom
      products={showroomProducts()}
      scene={getScene('showroom')}
      initialCategory={searchParams?.category ?? null}
      initialView={searchParams?.view === 'browse' ? 'browse' : 'discover'}
      initialQuery={searchParams?.q ?? ''}
      initialSort={searchParams?.sort ?? 'featured'}
    />
  )
}
