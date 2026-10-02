import { Account } from '@/components/Account'

export const metadata = { title: 'Profile', robots: { index: false } }

export default function AccountPage() {
  return (
    <div className="page page-narrow">
      <h1 className="app-title">Profile</h1>
      <Account />
    </div>
  )
}
