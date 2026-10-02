import type { Metadata } from 'next'
import { Favorites } from '@/components/Favorites'
import { listCars } from '@/lib/server/catalog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Favorites' }

export default async function FavoritesPage() {
  return (
    <div className="wrap page">
      <h1 className="app-title">Favorites</h1>
      <Favorites cars={await listCars()} />
    </div>
  )
}
