import { Button } from '@/components/ui'
import { TrackIcon } from '@/components/TrackIcon'

export default function NotFound() {
  return (
    <section
      className="section"
      style={{
        paddingTop: 'calc(var(--header-h) + 8rem)',
        minHeight: '70vh',
      }}
    >
      <div className="section-inner">
        <TrackIcon name="diamond" size={72} />
        <p className="eyebrow" style={{ marginTop: '2rem' }}>
          404
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 6vw, 5.5rem)',
            fontWeight: 320,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            color: 'var(--bone)',
            margin: '1.5rem 0 2rem',
          }}
        >
          This room is still
          <br />
          <em style={{ color: 'var(--brass)', fontStyle: 'italic' }}>being arranged.</em>
        </h1>
        <p className="page-hero-sub" style={{ marginBottom: '3rem' }}>
          The page you wanted is not available.
        </p>
        <div className="hero-actions">
          <Button href="/">Return home</Button>
          <Button href="/shop/" variant="ghost">
            Shop the edit
          </Button>
        </div>
      </div>
    </section>
  )
}
