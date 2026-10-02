import { Account } from '@/components/Account'

export const metadata = { title: 'Account', robots: { index: false } }

export default function AccountPage() {
  return (
    <div className="page page-narrow">
      <h1 className="page-title" style={{ marginBottom: 28 }}>
        Your account.
      </h1>
      <Account />
    </div>
  )
}
