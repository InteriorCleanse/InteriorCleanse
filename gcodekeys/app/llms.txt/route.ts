export const dynamic = 'force-static'

// AI-agent discovery file. Tells crawlers and browsing agents what this is.
export function GET() {
  const body = `# GCode Keys

> Custom car keys, cut like code. Build a custom fob for any car (mainstream,
> luxury, supercar), or order a replacement by VIN. Flat price in writing,
> ownership verified, programmed at the vehicle.

## What we do
- Design-your-own custom key fobs: color, finish, engraving, covers.
- Replacement and spare keys by VIN for most makes and models.
- Anti-theft Faraday pouches and accessories.

## How it works
1. Design a key or decode your VIN.
2. See one flat, all-in price in writing.
3. Verify ownership (ID + registration + VIN match) at checkout.
4. A verified tech comes to you, or a mail-in kit ships. Keys are coded at the vehicle.

## Boundaries
- We never program a car key remotely. Programming happens at the vehicle.
- Some late-model luxury/supercars are OEM/dealer-coordinated; we confirm per car.

## Pages
- / : store and key design studio
- /coverage/ : makes and models supported
- /how-it-works/ : the process
- /faq/ : common questions
`
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
