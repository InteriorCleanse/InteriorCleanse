import { ButtonLink } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="page page-narrow" style={{ textAlign: 'center', paddingTop: '14vh' }}>
      <p className="eyebrow">404</p>
      <h1 className="page-title" style={{ margin: '12px 0 16px' }}>
        Wrong turn.
      </h1>
      <p className="lead" style={{ margin: '0 auto 28px' }}>That page isn&apos;t on the map. The car may have been unlisted.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <ButtonLink href="/search">Search cars</ButtonLink>
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
      </div>
    </div>
  )
}
