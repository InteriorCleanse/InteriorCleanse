import { SavedList } from '@/components/Saved'

export const metadata = { title: 'Saved' }

export default function SavedPage() {
  return (
    <div className="wrap page">
      <h1 className="page-title" style={{ marginBottom: 28 }}>
        Saved <em>for later.</em>
      </h1>
      <SavedList />
    </div>
  )
}
