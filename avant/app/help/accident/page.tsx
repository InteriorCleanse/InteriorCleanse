import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice } from '@/components/ui'
import { publicInsurance } from '@/lib/server/insurance'

export const metadata: Metadata = { title: 'After an accident', description: 'What to do if you have an accident or break down in an AVANT car, step by step.' }

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export default function Accident() {
  const ins = publicInsurance()
  return (
    <div className="page page-narrow legal stack" style={{ gap: 18 }}>
      <p className="eyebrow">Help</p>
      <h1 className="page-title">After an accident.</h1>
      <p className="lead">Stay calm. Most of this takes ten minutes, and you don&apos;t have to remember it: this page is here whenever you need it.</p>

      <div className="row">
        <a className="btn btn-primary btn-lg" href="tel:911">
          Call 911
        </a>
        {ins.roadsidePhone ? (
          <a className="btn btn-secondary btn-lg" href={tel(ins.roadsidePhone)}>
            Roadside: {ins.roadsidePhone}
          </a>
        ) : null}
        {ins.claimsPhone ? (
          <a className="btn btn-secondary btn-lg" href={tel(ins.claimsPhone)}>
            Claims: {ins.claimsPhone}
          </a>
        ) : null}
      </div>

      <ol className="accident-steps">
        <li>
          <h2>Make everyone safe</h2>
          <p className="muted">
            Turn on the hazard lights and, if the car can move and it&apos;s safe, pull out of traffic. Check on everyone involved. If anyone is hurt, the
            road is blocked, or the other driver leaves or seems impaired, call 911.
          </p>
        </li>
        <li>
          <h2>Swap details, not blame</h2>
          <p className="muted">
            Get the other driver&apos;s name, phone, insurer and policy number, licence plate and the make and model of their car, plus any witnesses&apos;
            names and numbers. Be polite and stick to facts. Don&apos;t agree who was at fault; insurers decide that.
          </p>
        </li>
        <li>
          <h2>Take photos</h2>
          <p className="muted">
            Both cars from all sides, close-ups of the damage, the other car&apos;s plate, the road, signs and lights. The check-in camera on your trip page
            timestamps and fingerprints every photo.
          </p>
        </li>
        <li>
          <h2>Report it on AVANT</h2>
          <p className="muted">
            Open your trip and choose <strong>Report an accident or problem</strong>. Add the police report number if there is one, and the other driver&apos;s
            details. It goes straight to our claims team and to your host. Message your host too, so they know where their car is.
          </p>
        </li>
        <li>
          <h2>If the car can&apos;t be driven</h2>
          <p className="muted">
            {ins.roadsidePhone ? `Call roadside assistance on ${ins.roadsidePhone}. ` : 'Call roadside assistance (the number is on your trip). '}
            Don&apos;t arrange your own tow or repairs: the claims team and your host need to agree them first.
          </p>
        </li>
        <li>
          <h2>What happens next</h2>
          <p className="muted">
            Our claims team contacts you, usually within one business day. Third-party liability is covered by AVANT&apos;s programme during the trip, and
            what you pay for damage to the car can never exceed your protection plan&apos;s maximum. Read <Link href="/coverage" className="link">coverage, explained</Link>.
          </p>
        </li>
      </ol>

      <Notice icon="shield">
        Breakdowns that aren&apos;t your fault (a warning light, a flat tyre, a dead battery) are never charged to you. Report them the same way, as a
        breakdown.
      </Notice>
    </div>
  )
}
