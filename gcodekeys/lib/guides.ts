// The Garage — real, useful content for car owners. Free to read (good for
// SEO and shareable clips); the flagship guide doubles as the email lead
// magnet. Educational content written from general knowledge — no invented
// statistics, no product claims. Prices shown elsewhere are examples.

export type GuideSection = { h: string; body?: string[]; list?: string[] }

export type Guide = {
  slug: string
  title: string
  dek: string
  tag: string
  readMins: number
  // The flagship lead-magnet guide offered behind the email capture.
  flagship?: boolean
  sections: GuideSection[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'car-key-survival-guide',
    title: 'The Car-Key Survival Guide',
    dek: 'Everything a car owner should know about their keys before something goes wrong — the one you want saved on your phone.',
    tag: 'Essential',
    readMins: 8,
    flagship: true,
    sections: [
      {
        h: 'Know what key you actually have',
        body: [
          'Before you ever need a replacement, it pays to know which of four broad types sits in your pocket. The price, the process, and whether a locksmith can help all follow from this.',
        ],
        list: [
          'Basic transponder key — a metal blade with a chip in the head. Turns in the ignition; the chip has to be programmed to the car.',
          'Remote-head key — the same idea with lock/unlock buttons built into the head.',
          'Flip (switchblade) key — the blade folds into a fob and springs out at a button press.',
          'Smart key (push-to-start) — no blade in the ignition; the car senses the fob. Most have a hidden emergency blade inside.',
        ],
      },
      {
        h: 'Why one key is a risk you can remove cheaply',
        body: [
          'A single working key is the most expensive position you can be in. The day it breaks or disappears, you are not buying a key — you are buying an "all keys lost" job, which is slower and costs more because the car has to be put into a programming mode from scratch.',
          'A spare cut and programmed while you still have a working key is dramatically simpler. The lesson is boring but true: the cheapest time to make a second key is today, while everything still works.',
        ],
      },
      {
        h: 'What programming really means',
        body: [
          'Cutting a blade is only half the job. The chip or fob also has to be paired to your car’s immobilizer so the engine will start. That pairing happens at the vehicle, through the diagnostic port or the ignition — not "over the internet." Anyone who claims they can code a working key remotely without the car present is describing something that does not exist on modern vehicles.',
          'This is also why proof of ownership matters: coding a key to a car is exactly what a thief would need, so a legitimate service verifies the car is yours first.',
        ],
      },
      {
        h: 'The five-minute glovebox checklist',
        list: [
          'Photograph both sides of your key and the barcode on the key or its packaging if you have it.',
          'Write down your VIN (base of the windshield, driver door jamb) and store it with the photo.',
          'Note whether your car is push-to-start or uses a bladed key in the ignition.',
          'Decide now where a spare will live — a second driver, a magnetic box, a trusted drawer.',
          'Keep a service you trust saved, so a lost key is a phone call, not a panic.',
        ],
      },
      {
        h: 'When it has to be the dealer',
        body: [
          'Most makes and model years can be handled by a well-equipped locksmith. A minority — typically very recent luxury platforms with locked-down security — are dealer-only today. A good service tells you that up front and refers you rather than wasting your afternoon. "We can do any car" is a nice slogan; "we confirm your car before you pay" is the honest version.',
        ],
      },
    ],
  },
  {
    slug: 'lost-your-only-key',
    title: 'Lost Your Only Key? Do This First',
    dek: 'A calm, ordered checklist for the worst case — so you spend less and skip the dealer markup where you can.',
    tag: 'Emergency',
    readMins: 5,
    sections: [
      {
        h: 'Step 1 — confirm it is actually lost',
        body: [
          'Before you pay for anything, do a real search: last pockets, the car’s seats and footwells, the door you came in, the laundry. An all-keys-lost job is the most expensive key situation there is, so ten minutes of looking can be worth hundreds.',
        ],
      },
      {
        h: 'Step 2 — find your VIN and proof of ownership',
        body: [
          'Any legitimate service needs your VIN and evidence the car is yours (registration or title plus ID, with names that match). Have these ready and the whole job moves faster. No reputable locksmith makes a key for a car a stranger cannot prove they own.',
        ],
      },
      {
        h: 'Step 3 — get a flat price, in writing',
        body: [
          'Ask for the total before anyone is dispatched: the key, the cut, the programming, and any trip fee as one number. Watch for "starting at" pricing that climbs when the tech arrives. A flat, written price is the single best protection against the markup this trade is known for.',
        ],
      },
      {
        h: 'Step 4 — locksmith vs dealer',
        list: [
          'Most vehicles: a mobile locksmith comes to the car and is usually faster and cheaper than towing to a dealer.',
          'Very recent or high-security models: may be dealer-only — a good locksmith will tell you and refer you.',
          'Either way: make a spare the same day, so you never repeat this.',
        ],
      },
      {
        h: 'Step 5 — once you are back in',
        body: [
          'The moment you have a working key again, make a second one. You just paid the all-keys-lost premium; a spare is the insurance that means you never pay it twice.',
        ],
      },
    ],
  },
  {
    slug: 'what-a-spare-really-saves',
    title: 'What a Spare Key Really Saves You',
    dek: 'The quiet math on why a second key is the best cheap decision a car owner can make.',
    tag: 'Smart money',
    readMins: 4,
    sections: [
      {
        h: 'Two keys is one problem; one key is a countdown',
        body: [
          'With two working keys, a lost or broken key is an errand. With one, it is an emergency — and emergencies are where this trade makes its money. The entire cost difference between "cut me a spare" and "I have no keys" comes down to whether a working key still exists when you call.',
        ],
      },
      {
        h: 'Why all-keys-lost costs more',
        body: [
          'When at least one key works, a new key is added quickly. When none do, the car has to be forced into a programming state from zero — more time, sometimes more specialized tools, and on some cars additional security steps. You are paying for difficulty, not plastic.',
        ],
      },
      {
        h: 'The move',
        list: [
          'Make the spare while your current key still works — it is the cheapest this will ever be.',
          'Store it apart from the original (a second person, a safe, never both on one ring).',
          'Customize it so you can tell them apart at a glance — color, finish, or an engraving.',
        ],
      },
    ],
  },
]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug)
}

export const FLAGSHIP = GUIDES.find((g) => g.flagship) ?? GUIDES[0]
