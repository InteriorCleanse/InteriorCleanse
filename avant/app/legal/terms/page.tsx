import { Notice } from '@/components/ui'

export const metadata = { title: 'Terms' }

export default function Terms() {
  return (
    <div className="page page-narrow stack" style={{ gap: 18 }}>
      <h1 className="page-title">Trip terms</h1>
      <Notice tone="warn">Draft for legal review. State peer-to-peer car sharing laws require specific disclosures; counsel must complete these before launch.</Notice>
      <h2>The marketplace</h2>
      <p className="muted">AVANT connects guests with independent hosts who own the vehicles. During the car sharing period, AVANT assumes the host&apos;s liability to third parties up to the limits in the trip&apos;s coverage, as state law requires.</p>
      <h2>Drivers</h2>
      <p className="muted">Only the verified guest may drive. Drivers must hold a valid licence for the whole trip and meet the age rules for the car&apos;s class.</p>
      <h2>Price, cancellation and deposits</h2>
      <p className="muted">The total shown at checkout is what you pay. Free cancellation until 24 hours before pickup. Refundable holds are released within 48 hours after the trip.</p>
      <h2>Damage, tolls and tickets</h2>
      <p className="muted">Damage responsibility is capped by your coverage plan. Hosts must submit evidence; you have 72 hours to respond before any charge. Tolls and fines incurred during the trip are passed through at cost.</p>
      <h2>Recalls</h2>
      <p className="muted">Hosts may not list a vehicle with an unrepaired safety recall.</p>
    </div>
  )
}
