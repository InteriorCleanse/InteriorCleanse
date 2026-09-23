import type { Metadata } from 'next'
import { Showroom } from '@/components/showroom/Showroom'
import { getScene, type SceneId } from '@/lib/scenes'
import { SHOWROOM_CATEGORIES, showroomProducts, type ShowroomCategory } from '@/lib/showroom'
import type { Scene } from '@/lib/scenes'

/**
 * Each showroom category opens into its own living environment, so filtering the
 * collection changes the room around the product rather than leaving everything
 * on one locked backdrop.
 */
const CATEGORY_SCENE: Record<ShowroomCategory | 'all', SceneId> = {
  all: 'showroom',
  books: 'library',
  wellness: 'conservatory',
  home: 'atrium',
  cleaning: 'cleaning',
  fragrance: 'pavilion',
  merch: 'atelier',
  digital: 'gallery',
  'wall-art': 'gallery',
  partners: 'guestbook',
}

function sceneMap(): Partial<Record<ShowroomCategory | 'all', Scene>> {
  const out: Partial<Record<ShowroomCategory | 'all', Scene>> = {}
  for (const key of ['all', ...SHOWROOM_CATEGORIES] as (ShowroomCategory | 'all')[]) {
    const s = getScene(CATEGORY_SCENE[key])
    if (s) out[key] = s
  }
  return out
}

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
      scenes={sceneMap()}
      initialCategory={searchParams?.category ?? null}
      initialView={searchParams?.view === 'browse' ? 'browse' : 'discover'}
      initialQuery={searchParams?.q ?? ''}
      initialSort={searchParams?.sort ?? 'featured'}
    />
  )
}
