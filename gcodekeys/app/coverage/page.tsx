import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Coverage',
  description: 'GCode Keys covers most makes and models. Here is what we do on site, what needs the shop, and the short list of dealer-only vehicles we refer out.',
}

const DOES = [
  ['Toyota / Lexus', 'Transponder, remote-head, and most smart keys. All-keys-lost on many.'],
  ['Honda / Acura', 'Transponder and smart keys, on-board and OBD programming.'],
  ['Ford / Lincoln', 'Remote-head and smart keys; all-keys-lost supported on most.'],
  ['GM (Chevy, GMC, Buick, Cadillac)', 'Passlock relearn and OBD smart-key add.'],
  ['Stellantis (Chrysler, Dodge, Jeep, Ram)', 'Smart keys via the security gateway (AutoAuth).'],
  ['Nissan / Infiniti', 'Transponder and smart keys; PIN from the maker when needed.'],
  ['Hyundai / Kia', 'Transponder and smart keys; PIN via credentials.'],
  ['Subaru, Mazda', 'OBD add on most models.'],
]

const DEALER = [
  'Mercedes-Benz with FBS4 (roughly 2015 and newer)',
  'Tesla, Rivian, Lucid and other phone-key EVs',
  'Newest BMW platforms with limited aftermarket support',
  'Some late-model VW Group cars needing online component protection',
  'Late-model Volvo, Jaguar, Land Rover, and Porsche, by tool coverage',
]

export default function Coverage() {
  return (
    <main className="wrap" style={{ paddingBlock: '34px 60px' }}>
      <div className="kicker">Coverage</div>
      <h1>Most makes and models</h1>
      <p className="sub">We cut and code keys for the vast majority of cars on the road. A small set of late-model vehicles is dealer-only; we tell you up front and refer those out rather than waste your time.</p>

      <h2 style={{ marginTop: 34 }}>What we do on site</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        {DOES.map(([make, note]) => (
          <div className="card" key={make}>
            <h3>{make}</h3>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <p className="ex" style={{ marginTop: 12 }}>Exact support depends on year, model, and tool updates. Enter your VIN on the home page for a precise answer and a flat price.</p>

      <h2 style={{ marginTop: 34 }}>Dealer-only, for now</h2>
      <div className="tbox alert" style={{ marginTop: 12 }}>
        <div className="n" style={{ color: 'var(--alert)' }}>[!] WE REFER THESE OUT</div>
        <ul className="plainlist">
          {DEALER.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p>The aftermarket catches up constantly, so this list shrinks. If your car is here today, ask anyway; it may have changed.</p>
      </div>
    </main>
  )
}
