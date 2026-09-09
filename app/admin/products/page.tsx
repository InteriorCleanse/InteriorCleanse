import type { Metadata } from 'next'
import { ProductsManager } from '@/components/admin/ProductsManager'

export const metadata: Metadata = {
  title: 'Products — Admin',
  robots: { index: false, follow: false },
}

/** Password-protected by middleware, like the rest of /admin. */
export default function AdminProductsPage() {
  return <ProductsManager />
}
