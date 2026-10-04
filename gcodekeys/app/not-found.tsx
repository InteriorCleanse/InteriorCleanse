import Link from 'next/link'
import { LogoIcon } from '@/components/Logo'

export default function NotFound() {
  return (
    <main className="wrap" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBlock: '80px' }}>
      <LogoIcon size={54} />
      <div className="kicker" style={{ marginTop: 18 }}>Error 404</div>
      <h1 style={{ fontSize: 'clamp(2.4rem,7vw,4rem)' }}>
        <span className="g">Key not found.</span>
      </h1>
      <p className="sub" style={{ margin: '12px auto 0' }}>That page took a wrong turn. The one you want is probably the builder.</p>
      <Link className="btn glow" href="/" style={{ marginTop: 24 }}>BACK TO STORE<span className="arrow" aria-hidden="true">↗</span></Link>
    </main>
  )
}
