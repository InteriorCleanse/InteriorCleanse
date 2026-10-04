/**
 * THE FIRST-CAR JOURNEY — twelve steps from "I have some cash" to "my first
 * car sold or rented, every dollar logged", with what to look for at each.
 *
 * A step is done when Gavel can see it done in the member's own data (a
 * budget set, three cars watched, a paper bid, a car in the books), or when
 * the member ticks it. Gavel never ticks a step it cannot see.
 *
 * The advice is general practice for public US car auctions, written plainly.
 * Rules and fees vary by auction and by state, and the text says so where it
 * matters; the auction's own terms always win.
 */

export type JourneyFacts = {
  onboarded: boolean
  cashUsd?: number
  homeState?: string
  guidesRead: string[]
  watched: number
  watchedSources: number
  imports: number
  paperBids: number
  paperDecided: number
  carsOwned: number
  carsWithCosts: number
  materialsTicked: number
  soldOrRented: number
}

export type JourneyStep = {
  id: string
  n: number
  title: string
  why: string
  do: string[]
  lookFor?: string[]
  href: string
  action: string
  /** Done by what Gavel can see; undefined means only the member can tick it. */
  auto?: (f: JourneyFacts) => boolean
  ask: string
}

/** What to look for before bidding on any auction car. The heart of a beginner's protection. */
export const LOOK_FOR: Array<{ group: string; items: string[] }> = [
  { group: 'Title and paperwork', items: [
    'The listing says "clean title" and, where there is a photo of the title, the photo agrees. Walk away from salvage, rebuilt, flood, lemon or "TMU" (true miles unknown) to begin with.',
    'Which state issued the title, and whether it is in hand. "Title delayed" or "bill of sale only" can mean weeks of waiting or no title at all.',
    'The VIN (the 17-character vehicle ID) is the same in the listing, on the dash plate and on the driver\'s door sticker. A mismatch is a hard stop.',
  ] },
  { group: 'History', items: [
    'Decode the VIN: the year, engine and trim should match the listing.',
    'Run a history report (Carfax, AutoCheck or an NMVTIS report) for accidents, title brands, owners and odometer readings. Miles that go down over time are a hard stop.',
    'Check open recalls (Gavel\'s Intel and Parts screens do this). A dealer fixes a recall free, whoever owns the car.',
  ] },
  { group: 'Photos and condition report', items: [
    'Every angle is photographed. Few photos, wet photos or dark photos often hide something.',
    'Uneven gaps between panels, paint that does not match, or overspray on rubber trim mean a past repair.',
    'Tyres worn on one edge point to alignment or suspension work. Look at the date code on each tyre.',
    'Rust underneath: frame, rocker panels under the doors, brake lines. Surface rust is common; flaking or holes are not.',
    'The dashboard photo with the engine running: no check-engine, airbag or ABS lights. An airbag light can mean a deployed airbag, which is a big repair.',
    'Read the auction\'s condition report if there is one. Every auction grades differently; read their key.',
  ] },
  { group: 'Flood signs', items: [
    'Silt or a tide line under the carpets, in the trunk or in the spare-wheel well.',
    'Rust on seat bolts and under the dashboard, fogged lights, a musty smell in the description.',
    'Cars sold soon after a hurricane or flood in that region deserve extra care.',
  ] },
  { group: 'Engine and drive', items: [
    '"Runs and drives" is the seller\'s claim on the day, not a promise. A cold-start video, if offered, is worth watching.',
    'Smoke on start, puddles under the engine, or a milky oil cap are reasons to pass.',
    'How many keys come with it. A modern key fob can cost hundreds to replace.',
  ] },
  { group: 'The money and the rules', items: [
    'The buyer fee ("buyer\'s premium"), any gate, document or internet fee, and whether there is a reserve price.',
    'How fast you must pay, which payment methods they take, and the pickup deadline. Storage fees per day often start after a few days.',
    'Almost every auction car is sold "as is": no returns, no warranty.',
    'Where the car is, and a real transport quote before you bid.',
    'Your number, set before the auction starts: Gavel\'s plan works it out from similar cars. Never bid past it in the moment.',
  ] },
]

export const JOURNEY: JourneyStep[] = [
  { id: 'goal', n: 1, title: 'Set your goal, budget and state', why: 'Your budget decides which cars and auctions make sense. Your state decides tax, title and whether you can buy at some auctions.', do: ['Answer the four setup questions: goal, state, cash and the cars you like.', 'Count every dollar you can spend on the first car, including fees, transport and a cushion for surprises.'], href: '#setup', action: 'Open setup', auto: (f) => f.onboarded && !!f.cashUsd && !!f.homeState, ask: 'Help me set a realistic budget for my first auction car.' },
  { id: 'where', n: 2, title: 'Pick the auctions you can actually buy at', why: 'Some auctions are open to anyone; others need a dealer licence or a broker. Start where the public buys and titles are clean.', do: ['Open Auctions and read the "who can buy" line for each.', 'Good first places: government and police auctions (GSA, GovDeals, Public Surplus), eBay Motors, and the enthusiast sites if you want a sports car.', 'Copart and IAA sell mostly damaged cars and need a broker or licence for many lots, depending on your state. Later, not first.'], href: '#auctions', action: 'Open Auctions', ask: 'Which auctions can I buy at as a beginner in my state, and which should I start with?' },
  { id: 'learn', n: 3, title: 'Learn the words', why: 'Auction listings use a short language: title brands, "runs and drives", reserve, buyer\'s premium, proxy bid. Knowing them is most of the protection.', do: ['Read "Your first auction car" in the Playbook (about twelve minutes).', 'Look up any word you do not know in the Intel glossary.'], href: '#playbook/first-car', action: 'Read the guide', auto: (f) => f.guidesRead.includes('first-car'), ask: 'Explain the words I will see on an auction listing, simply.' },
  { id: 'shortlist', n: 4, title: 'Shortlist three cars across two auctions', why: 'Comparing cars side by side shows you what a fair price looks like, and stops you falling for the first one.', do: ['Open Deals with your budget and a profit floor, or search the Feed in plain words.', 'Watch three cars, from at least two different auctions. Bring in lots from other auctions with Import.'], href: '#deals', action: 'Find cars', auto: (f) => f.watched + f.imports >= 3 && (f.watchedSources >= 2 || f.imports > 0), ask: 'Find me three clean cars for my budget across different auctions.' },
  { id: 'check', n: 5, title: 'Check each car properly', why: 'Most bad buys are visible before the auction, in the title, the VIN history and the photos.', do: ['Go through the checklist below for each car on your shortlist.', 'Drop any car that fails a hard stop. There is always another car.'], lookFor: LOOK_FOR.flatMap((g) => g.items.map((i) => `${g.group}: ${i}`)), href: '#watch', action: 'Open your watchlist', ask: 'Walk me through checking one of my watched cars before I bid.' },
  { id: 'number', n: 6, title: 'Set your number for each car', why: 'Your number is the most you will bid. It comes from what similar cars sell for, minus every cost and the profit you want. Set it calm, before the auction.', do: ['Open each car\'s plan. Check the similar cars it used.', 'Open P/L and type your real fee, transport quote and repair estimate.'], href: '#watch', action: 'Open your cars', auto: (f) => f.paperBids >= 1, ask: 'How do I work out the most I should bid on a car?' },
  { id: 'practise', n: 7, title: 'Practise with three paper bids', why: 'A paper bid records your number without sending anything. Watching how auctions end teaches you prices faster than anything else.', do: ['Place a paper bid on three cars at your number.', 'When each auction ends, record whether you would have won and what it sold for.'], href: '#watch', action: 'Paper bids', auto: (f) => f.paperBids >= 3, ask: 'How did my paper bids go, and what should I learn from them?' },
  { id: 'register', n: 8, title: 'Register at the auction', why: 'Registration takes time: ID checks, a deposit or card on file, sometimes a fee. Do it days before the car you want.', do: ['Create your account on the auction\'s own site.', 'Write down: the buyer fee, payment deadline, payment methods, pickup deadline and storage fees.'], href: '#auctions', action: 'Open Auctions', ask: 'What do I need to register at my first auction?' },
  { id: 'bid', n: 9, title: 'Bid, never past your number', why: 'Gavel never bids for you. You bid on the auction\'s own site. The number you set calm is the one that protects you.', do: ['Bid on the auction site. Many let you leave a maximum (a proxy bid) that bids for you up to that amount.', 'If it goes past your number, let it go. Record the final price; it makes the next estimate better.'], href: '#watch', action: 'Your cars', auto: (f) => f.carsOwned >= 1, ask: 'How should I bid on the auction day so I don\'t overpay?' },
  { id: 'won', n: 10, title: 'Won: pay, move it, title it', why: 'Late payment or late pickup costs money. The title must be in your name before you sell or rent.', do: ['Pay inside the deadline. Book transport the same day.', 'Put the car in your books with what you paid ("I bought it").', 'Insure it before it is driven, and title and register it as your state requires.'], href: '#business', action: 'Open Business', auto: (f) => f.carsOwned >= 1 && f.carsWithCosts >= 1, ask: 'I won my first car. What do I do in the next 48 hours?' },
  { id: 'ready', n: 11, title: 'Make it ready', why: 'Fresh fluids, a good detail and clear photos are the cheapest way to sell faster and for more.', do: ['Work through the car\'s materials list. Find parts that fit with Parts.', 'Log every cost as you go, so the books are true.'], href: '#parts', action: 'Open Parts', auto: (f) => f.materialsTicked >= 3, ask: 'What should I do to get my car ready to sell or rent?' },
  { id: 'sell', n: 12, title: 'Sell it or rent it, and log every dollar', why: 'The books tell you the truth: what you made, how long it took, and what to do differently on the next one.', do: ['Price it against similar cars, not against what you paid.', 'Log the sale, or each rental payout, in Business. Then start the next car.'], href: '#business', action: 'Open Business', auto: (f) => f.soldOrRented >= 1, ask: 'Help me price my car to sell, and plan my next one.' },
]

export type StepStatus = { id: string; done: boolean; by: 'gavel' | 'you' | null }

export function journeyStatus(f: JourneyFacts, ticked: string[]): StepStatus[] {
  const mine = new Set(ticked)
  return JOURNEY.map((s) => {
    const auto = s.auto ? s.auto(f) : false
    return { id: s.id, done: auto || mine.has(s.id), by: auto ? 'gavel' : mine.has(s.id) ? 'you' : null }
  })
}

export const STAGES = ['Getting set up', 'Hunting', 'Practising', 'Buying', 'Making it ready', 'Selling and growing'] as const
/** The stage a member is in: the first unfinished step decides it. */
export function stageOf(status: StepStatus[]): { n: number; name: string; next?: JourneyStep } {
  const i = status.findIndex((s) => !s.done)
  const next = i >= 0 ? JOURNEY[i] : undefined
  const n = !next ? 6 : next.n <= 3 ? 1 : next.n <= 5 ? 2 : next.n <= 7 ? 3 : next.n <= 10 ? 4 : next.n === 11 ? 5 : 6
  return { n, name: STAGES[n - 1], next }
}

export type TodayTask = { id: string; title: string; why: string; href: string; done: boolean }

/**
 * Today's three: the next journey step, the most urgent thing in the books or
 * the auctions, and one habit for the stage. Stable through the day, so a task
 * ticked this morning is still ticked tonight.
 */
export function todayTasks(input: { next?: JourneyStep; urgent?: { id: string; title: string; body: string; href?: string }; stage: number; budgetUsd?: number; done: string[] }): TodayTask[] {
  const done = new Set(input.done)
  const out: TodayTask[] = []
  if (input.next) out.push({ id: `step-${input.next.id}`, title: input.next.title, why: input.next.why, href: input.next.href, done: false })
  if (input.urgent) out.push({ id: `urgent-${input.urgent.id}`, title: input.urgent.title, why: input.urgent.body, href: input.urgent.href ?? '#business', done: false })
  const habit: Record<number, Omit<TodayTask, 'done'>> = {
    1: { id: 'habit-browse', title: 'Look at ten cars in your price, without bidding', why: 'Ten minutes a day of looking teaches you what normal prices are.', href: '#feed' },
    2: { id: 'habit-deals', title: `Run Deals${input.budgetUsd ? ` at $${input.budgetUsd.toLocaleString('en-US')}` : ''} with a profit floor`, why: 'New lots appear every day; the good ones go fast.', href: '#deals' },
    3: { id: 'habit-ended', title: 'Check how yesterday\'s watched auctions ended', why: 'Final prices teach you the market and sharpen every estimate.', href: '#watch' },
    4: { id: 'habit-terms', title: 'Re-read the auction\'s fees and deadlines', why: 'A missed pickup or payment deadline is the most avoidable cost there is.', href: '#auctions' },
    5: { id: 'habit-costs', title: 'Log today\'s receipts in Business', why: 'True books are the only way to know what a car really made.', href: '#business' },
    6: { id: 'habit-next', title: 'Shortlist your next car', why: 'The money from this car works hardest when the next one is already lined up.', href: '#deals' },
  }
  out.push({ ...habit[input.stage], done: false })
  // Nothing urgent today: one more small habit, so there are always three.
  if (out.length < 3) out.push({ id: input.stage <= 2 ? 'habit-words' : 'habit-ask', title: input.stage <= 2 ? 'Learn three auction words in the glossary' : 'Ask your coach about one car you are watching', why: input.stage <= 2 ? 'Knowing the words on a listing is most of the protection.' : 'A second look before the auction is how you avoid the expensive mistakes.', href: input.stage <= 2 ? '#intel' : '#coach', done: false })
  for (const t of out) t.done = done.has(t.id)
  return out.slice(0, 3)
}
