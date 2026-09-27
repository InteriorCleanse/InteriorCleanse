/**
 * THE PLAYBOOK — everything the owner asked to have "dumbed down", as data the
 * app renders: buying your first auction car, going in person, the dealer
 * licence, flipping, minor fixes, starting a rental company, and reading a
 * listing.
 *
 * Written for a beginner with tools but no car experience. Short sentences. A
 * term is explained the first time it appears. Where a number depends on the
 * state, the auction house or the year, the text says "varies" and where to
 * check, instead of inventing one. Nothing here promises a profit.
 */

export type GuideSection = {
  title: string
  body?: string
  steps?: string[]
  tip?: string
  warning?: string
}

export type Guide = {
  id: string
  title: string
  tagline: string
  level: 'start' | 'next' | 'later'
  minutes: number
  sections: GuideSection[]
  checklist: string[]
}

export const GUIDES: Guide[] = [
  {
    id: 'first-car',
    title: 'Your first auction car, start to finish',
    tagline: 'From a card in the feed to a car in your driveway, one step at a time.',
    level: 'start',
    minutes: 12,
    sections: [
      {
        title: 'Pick the car in the feed',
        steps: [
          'Keep Starter mode on. It hides salvage titles, damaged cars, cars that do not run, and anything over your price and mileage caps.',
          'Read the three "Why it scores this" lines. The score compares the price now with what similar cars are listed for. A high score means a big gap, not a sure thing.',
          'Look at the red flags first. If there is one you do not understand, do not bid until you do.',
          'Prefer a boring, common car for your first one. Parts are cheap, buyers are many, and mistakes cost less.',
        ],
        tip: 'A "comp" (comparable) is another listing of the same car, similar year and miles. Gavel needs at least three to show an estimate. Fewer, and it says NOT ENOUGH COMPS on purpose.',
      },
      {
        title: 'Check it is the car it says it is',
        steps: [
          'Find the VIN. It is the 17-character code on the listing, on the dashboard by the windscreen, and on the door sticker. No VIN in the listing? Ask the seller for it. No VIN, no bid.',
          'Type the VIN into Gavel (Settings → Decode a VIN, or the card). The free government decode tells you the year, make, model, engine and trim the factory built. If it does not match the listing, walk away.',
          'Buy a history report. Carfax and AutoCheck are the well-known ones; NMVTIS is the government title database that many cheaper report sites read from. It costs a small fee per car. It shows title brands (salvage, flood, lemon), reported accidents, odometer readings and how many owners.',
          'Compare the odometer in the report with the listing. A car that "lost" miles is a car you do not buy.',
        ],
        warning: 'A clean title in the listing is the seller\'s word. The history report is the check. Do both.',
      },
      {
        title: 'Look for what the photos hide',
        steps: [
          'Zoom every photo. Mismatched paint shade between panels, uneven gaps around the hood or doors, and brand-new parts on an old car often mean a repaired crash.',
          'Ask the seller three questions in writing: Does it start, run and drive? Any warning lights on the dash? Any leaks under it after it sits overnight?',
          'If the car is within driving distance, go and see it. If it is not, pay a mobile pre-purchase inspection. An independent mechanic drives to the car and sends you a report with photos. It costs a modest fee and saves thousands.',
          'For an online yard auction with no test drive, assume anything the photos do not show is broken, and price that in.',
        ],
      },
      {
        title: 'Know your number',
        steps: [
          'Open Plan my bid. Type the resale price you believe in (start from the comps estimate), what fixes you expect, and how far the car is from you.',
          'The plan subtracts the buyer fee, transport, repairs, a cushion for surprises and your margin. What is left is your maximum bid.',
          'Write that number down. Never bid above it, not by $100. The whole game is buying at your number, not at theirs.',
          'If the current bid is already above your number, that is not your car. There will be another one.',
        ],
        tip: 'The buyer fee is what the auction charges the winner on top of the hammer price. Some houses charge a percentage, some a sliding scale. Gavel shows the published basis and a link to verify it.',
      },
      {
        title: 'Register and get ready',
        steps: [
          'Online: create your account days before the auction ends. Some houses want a deposit or a card on file and verify your ID, which can take a day.',
          'In person: bring a photo ID and the deposit the house asks for. It is refunded if you buy nothing.',
          'Sort out the money before you win. Auctions want payment within a short window, often one to three business days, by wire or certified funds. Card limits are usually low.',
          'Decide how the car gets home before you bid: drive it back with a friend, or get a transport quote.',
        ],
      },
      {
        title: 'How the bidding works',
        steps: [
          'Countdown auctions (eBay, Cars & Bids, Bring a Trailer): the listing ends at a set time. Many sites add time when a bid lands in the final minutes, so "sniping" (a bid in the last seconds) rarely works.',
          'Proxy bids: you enter your maximum once and the site bids for you in small steps up to that number. This is the safest way to bid: set your number and stop watching.',
          'Live lanes (Copart, IAA, dealer auctions, local auctions): a virtual or real auctioneer sells each lot in under a minute. Pre-bid your maximum before the lane starts and let the system bid for you.',
          'Reserve: a secret minimum the seller wants. If bidding ends under it, the car does not sell. "No reserve" means the high bid wins.',
          'When the bid passes your number, put the phone down. The feeling that you are "so close" is how people overpay.',
        ],
      },
      {
        title: 'If you win',
        steps: [
          'Pay inside the window the house gives you. Late payment means fees and, at some houses, a ban.',
          'Get the title and a bill of sale. The title is the ownership document; the bill of sale is the receipt with the VIN, the price, the date and both names. Do not hand over the balance without the title in your hand or in escrow.',
          'Insure the car in your name before it moves. Call your insurer with the VIN; it takes ten minutes.',
          'Transport: an open carrier is the normal choice. Get two quotes, check the carrier\'s USDOT number, and photograph the car at pickup and delivery.',
          'Register it in your state within the deadline. Bring the title, the bill of sale, your ID and proof of insurance.',
        ],
        warning: 'Never wire money to a private seller you have not met, and never pay a "deposit" to hold a car you have not seen. Auction houses take payment through their own system; a stranger asking for a wire is a scam pattern.',
      },
      {
        title: 'If you do not win',
        steps: [
          'Good. You held your number. Mark the paper bid as lost in Watch, and note what the car finally sold for.',
          'Over ten cars, your paper record shows you whether your numbers are too low, too high, or just right.',
        ],
      },
      {
        title: 'The first week with the car',
        steps: [
          'Change the oil and filter, check every fluid, check tyre dates and pressures, and read the codes with an OBD-II scanner (a small plug-in tool for the port under the dash).',
          'Fix safety items first: brakes, tyres, lights, wipers. Cosmetics wait.',
          'Keep every receipt in one folder. Whether you flip, rent or keep the car, records add value.',
        ],
      },
    ],
    checklist: [
      'Starter mode is on and I read the red flags',
      'I have the VIN and the decode matches the listing',
      'I bought a history report and the odometer makes sense',
      'I have asked the seller my three questions in writing',
      'I have seen the car or paid for a mobile inspection',
      'I opened Plan my bid and wrote down my maximum',
      'I know the buyer fee and the payment window',
      'I am registered, with ID and deposit sorted',
      'I have a transport plan and two quotes',
      'I will insure it in my name before it moves',
      'I will not bid above my number',
    ],
  },
  {
    id: 'in-person',
    title: 'Going to an auction in person',
    tagline: 'Where to find one, what to bring, how to walk a car in ten minutes, and when to stop.',
    level: 'start',
    minutes: 10,
    sections: [
      {
        title: 'Find a public auction near you',
        steps: [
          'Search "public auto auction" plus your city. Look for weekly sales that say "open to the public". Dealer-only auctions will turn you away without a licence.',
          'Copart and IAA yards sell to the public in many states. The Auctions screen says how to check yours.',
          'Government surplus (GovDeals, your county or city fleet sale) is public, honest and cheap. Police and fleet cars come with maintenance records.',
          'Go to your first two auctions without bidding. Sit near the front, watch what sells and for how much, and write it down. This is the cheapest education in cars.',
        ],
      },
      {
        title: 'Preview day',
        body: 'Most houses open the lot the day before, or the morning of, the sale. This is the only time you can touch the cars. Never bid on a car you did not preview.',
        steps: [
          'Print the lot list and mark the cars in your budget. Preview those, not the shiny ones.',
          'Cars are usually sold "as is": no warranty, no returns. If it breaks on the way home, it is yours.',
        ],
      },
      {
        title: 'What to bring',
        steps: [
          'Photo ID and the deposit (cash or card; the amount is on the house\'s website).',
          'A bright flashlight. Half of what matters is underneath.',
          'An OBD-II scanner. It plugs in under the dash and shows engine codes and, on many cars, whether codes were recently cleared to hide a problem. A basic one costs about the price of a tank of fuel.',
          'A small magnet. It will not stick to body filler over a repaired panel.',
          'Gloves, paper towels, and a friend who will tell you no.',
        ],
        tip: 'A paint-depth gauge is a nice extra for later. For now the magnet and your eyes do most of the work.',
      },
      {
        title: 'Walk a car in ten minutes',
        steps: [
          'Stand at each corner and look down the side. Waves in the reflection mean bodywork.',
          'Check panel gaps and paint shade panel to panel. Look for overspray on rubber seals.',
          'Open the hood. Look for fresh paint, new bolts, fluid leaks, and a battery date. Pull the oil cap: milky residue means coolant is mixing with oil.',
          'Look at the tyres: even wear, matching brands, and the four-digit date code (week and year) on the sidewall. Old tyres are a cost.',
          'Inside: does the wear match the miles? A 40,000-mile car with a shiny worn steering wheel and pedals is suspicious. Smell for damp. Lift the carpet edge in the trunk and look for silt or rust: flood signs.',
          'Check that the VIN on the dash, the door sticker and the paperwork all match.',
          'If the house allows it, start the car cold. Listen for knocks, watch the exhaust colour, and check that every dash light goes out. An airbag light is a stop sign.',
          'Plug in the scanner. Codes, or a computer that was just reset, are a reason to walk.',
          'Read the house\'s condition board or light system. Many yards use green (runs and drives as announced), yellow (announced problems), red (as is, no guarantee at all). The exact meaning is on the house\'s rules sheet.',
        ],
        warning: 'Never work under a car on a yard. Look with the flashlight from the ground.',
      },
      {
        title: 'In the lane',
        steps: [
          'Register before the lane opens and get your bidder number.',
          'The auctioneer calls the price fast. The ringman on the floor spots bids and relays them. Raise your number clearly, once.',
          'Bid in the house increments. Do not shout numbers.',
          'Your maximum is written on your hand. When the price passes it, lower your hand and enjoy the show.',
          'If you win, the clerk brings paperwork to sign. Pay at the office inside the window they give you.',
        ],
      },
    ],
    checklist: [
      'I found a public auction and checked its rules and fees',
      'I attended once without bidding',
      'ID, deposit, flashlight, scanner, magnet packed',
      'I previewed every car I might bid on',
      'VIN matches on dash, door and paperwork',
      'No airbag light, no fresh codes, no flood signs',
      'My maximum is written on my hand',
      'I know how to pay and by when',
    ],
  },
  {
    id: 'dealer-licence',
    title: 'Do I need a dealer licence?',
    tagline: 'What a licence unlocks, when the law says you need one, and the steps to get it.',
    level: 'next',
    minutes: 8,
    sections: [
      {
        title: 'Public versus dealer-only',
        body: 'Anyone can buy on eBay Motors, Cars & Bids, Bring a Trailer, GovDeals and public auctions. Copart and IAA sell to the public in many states but not all. Manheim, ADESA and ACV are dealer-only: no licence, no account. That is where used-car lots buy their inventory at wholesale, so it is the main reason to get a licence.',
      },
      {
        title: 'When the law says you need one',
        steps: [
          'Every state caps how many cars a private person may sell in a year before the state calls them a dealer. The cap varies by state, from a few cars to more than a dozen. Check "dealer licence" on your state DMV or motor vehicle department site for the exact number.',
          'Selling above the cap without a licence can mean fines and losing the right to register cars. Do not test it.',
          '"Title jumping" is selling a car you never titled in your name, by passing the seller\'s open title to your buyer. It is illegal in every state and it is how many first-time flippers get into trouble. Title every car you buy.',
        ],
        warning: 'The per-year limit and the licence rules are state law. The number in your state is the only number that matters.',
      },
      {
        title: 'What a licence unlocks',
        steps: [
          'Dealer-only auctions with condition reports graded 0 to 5, so you can buy without seeing the car.',
          'Dealer plates for moving unregistered cars legally.',
          'Wholesale pricing and access to off-lease and fleet cars in bulk.',
          'Sales-tax handling that fits a business.',
        ],
      },
      {
        title: 'The general steps',
        steps: [
          'Form a business (an LLC is the usual choice) and get an EIN from the IRS. Both are cheap and can be done online.',
          'Get a surety bond. It is an insurance-like guarantee the state requires; you pay a yearly premium for a bond of a size the state sets.',
          'Have a compliant place of business. Many states want a small lot or office with a sign and set hours; some allow a home office for wholesale-only licences. This is the step that trips people up, so read your state\'s rules first.',
          'Take the pre-licensing course if your state requires one, then pass the exam.',
          'Apply, pay the fee, pass the inspection and the background check.',
          'Renew every year. Keep the records the state requires for every car.',
        ],
        tip: 'Costs vary a lot by state: the bond premium, the lot, insurance and fees together can run from the low thousands upward per year. Get the real numbers from your state before you decide.',
      },
      {
        title: 'The shortcut while you wait',
        body: 'A "dealer buying service" or a registered broker buys at dealer-only auctions on your behalf for a flat fee per car. It is the legal way to reach wholesale cars before you are licensed. Compare the fee with what a licence would cost you per year.',
      },
    ],
    checklist: [
      'I know my state\'s per-year private sale limit',
      'I title every car I buy in my name',
      'I know whether my state allows a home-based wholesale licence',
      'I have priced the bond, the lot and the fees for my state',
      'I have compared a buying service against a licence',
    ],
  },
  {
    id: 'flipping',
    title: 'Flipping: buy, fix, sell',
    tagline: 'The maths, the cars that turn over, the fixes that pay, and the rules that keep you out of trouble.',
    level: 'next',
    minutes: 12,
    sections: [
      {
        title: 'The maths',
        body: 'A flip works when: purchase price + buyer fee + transport + fixes + carrying costs (insurance, storage, registration) + selling fees are less than the sale price, with something left for your time. Gavel\'s Plan screen does this sum for you before you bid. Most failed flips lost money before the hammer fell.',
        tip: 'Carrying cost is what the car costs you per week while it sits unsold. Price to sell in two weeks, not to win an argument with the market.',
      },
      {
        title: 'What makes a car flippable',
        steps: [
          'It is on the demand list or something like it: cars people search for by name and pay quickly for.',
          'Clean title, records, two keys, common colour. Rare colours and heavy modifications shrink your buyer pool.',
          'Nothing wrong that you cannot price. A car with an unknown noise is a car with an unknown cost.',
          'Bought at least the buyer fee plus fixes plus your margin under what it will list for. If it is not, it is not a flip; it is a purchase.',
        ],
      },
      {
        title: 'The inspection you pay for',
        body: 'Before or right after buying, pay a mobile mechanic for a full inspection with a written list: what is broken, what is wearing, what it costs. That list is your repair budget and your sales pitch ("new brakes, new battery, inspected on this date").',
      },
      {
        title: 'Fixes that pay',
        steps: [
          'A deep detail inside and out. This is the highest return per dollar of anything you can do.',
          'Headlight restoration, new wiper blades, bulbs, a battery, air filters.',
          'Tyres when they are old or mismatched. Buyers see tyres first.',
          'Brakes when they squeal or pulse. Pads and rotors are a common, well-documented job.',
          'Paintless dent repair by a mobile technician for door dings.',
          'Small paint chip touch-up, interior trim clips, a wheel refinished by a mobile service.',
        ],
      },
      {
        title: 'Fixes that do not pay',
        steps: [
          'Full paint jobs. They cost more than they add and they look like a cover-up.',
          'Transmissions, engines, head gaskets: too expensive and too risky for a flip.',
          'Anything airbag, frame, or flood related. Do not buy these cars to begin with.',
          'Electrical faults you cannot diagnose in an hour.',
        ],
        warning: 'Never disable or bypass an airbag, seatbelt or brake warning. Fix it or disclose it. Safety systems are not cosmetics.',
      },
      {
        title: 'Hiring cheap labour safely',
        steps: [
          'Mobile mechanics and mobile detailers come to you and charge by the job. Get the quote in writing before they start.',
          'Pay on completion, not up front. Keep the receipt with the VIN on it.',
          'Buy the parts yourself from a reputable seller when you can; it is often cheaper and you know what went on the car.',
          'Ask for the old parts back. It proves the work was done.',
        ],
      },
      {
        title: 'Selling',
        steps: [
          'Twenty clean photos in daylight, all four corners, interior, odometer, engine bay, tyres, and every flaw. Honest listings sell faster and avoid disputes.',
          'Write the listing the way Gavel writes a card: year make model trim, miles, title status, what was fixed, what is not perfect, the price.',
          'Price at the low end of the comps and hold firm. A car priced right sells in days; a car priced high sells in months and costs you money every week.',
          'Meet at a bank or police station lot. Take payment as a cashier\'s cheque verified at the issuing bank, or a cash deposit made in front of you. Never accept an overpayment with a request to refund the difference.',
          'Sign the title over properly, write a bill of sale in two copies, remove your plates, and file the release of liability with your state right away.',
        ],
      },
      {
        title: 'The rules',
        steps: [
          'Title every car in your name before selling it. No exceptions (see the licence guide).',
          'Stay under your state\'s per-year sale limit or get licensed.',
          'Sales tax is charged when the car is registered by the buyer, but some states also want it from you as a seller once you are a dealer. Ask your state.',
          'Keep records for every car: what you paid, every receipt, what you sold it for. It is your tax record and your proof.',
        ],
      },
    ],
    checklist: [
      'The plan shows a margin after every cost',
      'The car is on the demand list or sells quickly in my area',
      'A mechanic\'s written inspection is in my folder',
      'Fix list covers safety first, then detail, then cosmetics',
      'Quotes in writing, pay on completion, old parts back',
      'Twenty honest photos and an honest listing',
      'Priced to sell in two weeks',
      'Title in my name, bill of sale, release of liability filed',
      'I am under my state\'s sale limit',
    ],
  },
  {
    id: 'minor-fixes',
    title: 'Minor fixes you can do with basic tools',
    tagline: 'What is safe to try yourself, what to hire out, and what to leave alone.',
    level: 'next',
    minutes: 8,
    sections: [
      {
        title: 'Do it yourself (easy)',
        steps: [
          'Detail: vacuum, shampoo the carpets, clay and wax the paint, clean the glass inside. Tools: a shop vac, microfibre cloths, a bucket. An afternoon.',
          'Headlight restoration: a sanding-and-polish kit from any parts store. An hour. Makes an old car look five years newer.',
          'Wiper blades, bulbs, cabin and engine air filters: no tools or a screwdriver. Twenty minutes each. Watch one video for your exact model first.',
          'Battery: a wrench, gloves, eye protection. Note the radio code first if the car has one. Disconnect negative first, connect negative last.',
          'Key fob battery: a coin cell and a small screwdriver.',
          'Read fault codes with an OBD-II scanner and look up what they mean before you decide anything.',
          'Top up fluids to the marks: oil, coolant when cold, washer fluid. Never open a hot radiator cap.',
        ],
      },
      {
        title: 'Do it yourself (careful)',
        steps: [
          'Brake pads and rotors: a jack, jack stands, a lug wrench, a socket set, a C-clamp or piston tool, torque wrench. Watch two videos for your exact car, do one wheel at a time, and torque the wheel nuts to spec. If the pedal feels wrong afterwards, do not drive it; call a mechanic.',
          'Tyre plug for a small puncture in the tread: a plug kit and pliers. Not for sidewalls, not for holes near the edge. A tyre shop patch is the proper fix.',
          'Paint chip touch-up: a colour-matched pen or bottle by the paint code on the door sticker. Small chips only.',
          'Interior trim clips and loose panels: a trim tool set and the right clips.',
        ],
        warning: 'Never work under a car held up by a jack alone. Use rated jack stands on hard, level ground and chock the wheels. Brakes are the first job most people get wrong; if you are not certain, hire it.',
      },
      {
        title: 'Hire it (cheap and fast)',
        steps: [
          'Paintless dent repair: a mobile technician removes door dings without paint. Priced per dent.',
          'Wheel refinishing: mobile services repair curb rash on the spot.',
          'Windshield chips: a mobile glass company fills them in twenty minutes; many insurers cover it.',
          'Alignment after any suspension work, and any tyre mounting and balancing.',
          'A pre-purchase or post-purchase inspection by an independent mechanic.',
        ],
      },
      {
        title: 'Leave it alone',
        steps: [
          'Airbags, seatbelt pretensioners, ABS modules.',
          'Transmissions, engine internals, timing chains and belts.',
          'Frame or structural repair, flood damage.',
          'Air conditioning refrigerant (licensed handling), high-voltage work on hybrids and EVs.',
        ],
      },
    ],
    checklist: [
      'Jack stands and wheel chocks before anything under the car',
      'One video for my exact model before each job',
      'Battery: negative off first, on last',
      'Codes read and understood before buying parts',
      'Brakes checked by a second person before driving',
      'Receipts and old parts kept',
    ],
  },
  {
    id: 'rental-company',
    title: 'Starting a rental car company',
    tagline: 'Two roads, the first car, the numbers to watch, and your first ninety days.',
    level: 'later',
    minutes: 14,
    sections: [
      {
        title: 'The two roads',
        steps: [
          'Peer-to-peer (Turo, Getaround): you list a car you own on their platform. They bring the customers, the payments and a protection plan; they take a share of each trip. You can start with one car this month.',
          'Your own fleet: your company, your insurance, your bookings, your customers. More margin per day, much more work and risk, and the insurance is the hard part.',
          'Most people start on peer-to-peer, learn what renters break and what they pay for, and only then think about a fleet.',
        ],
      },
      {
        title: 'Peer-to-peer basics',
        steps: [
          'Every platform has an eligibility page: a maximum vehicle age, a mileage cap, a clean (non-salvage) title, and a value ceiling. The numbers change; read the current page before you buy a car for it.',
          'Photos, a clean car and fast replies drive bookings. Treat it like the listing skills from the flipping guide.',
          'Know what the platform\'s protection plan covers and what it does not. Ask your own insurer whether they will cover a car used for rental; many personal policies exclude it.',
          'Set a cleaning fee, a mileage limit and a fuel rule from day one.',
        ],
      },
      {
        title: 'Your own fleet: the checklist',
        steps: [
          'Form an LLC and get an EIN. Open a business bank account.',
          'Commercial auto insurance for rental use. This is the biggest cost and the hardest quote to get. Get quotes before you buy a single car; some insurers will not write a one-car rental fleet at all.',
          'A rental agreement reviewed by a lawyer in your state: deposits, damage, fuel, mileage, late returns, who may drive.',
          'A way to verify a renter\'s licence and take a deposit (card hold).',
          'GPS trackers on every car, a cleaning routine, and a maintenance schedule by miles.',
          'A booking system. Start with a calendar and a spreadsheet; buy software when the spreadsheet hurts.',
          'Your state may require a rental company registration or a surcharge collection. Ask the DMV and your state revenue department.',
        ],
        warning: 'Do not rent a car to anyone before the insurance that covers rental use is in force in writing. A personal policy that excludes commercial use leaves you holding the whole loss.',
      },
      {
        title: 'Choosing the first car',
        steps: [
          'Reliable, cheap to fix, boring colour: Toyota Camry or Corolla, Honda Civic or Accord, Toyota RAV4, Honda CR-V. These rent every week and nobody argues about them.',
          'On peer-to-peer, demand favours a few extra choices: Tesla Model 3 (cheap to run, popular), Jeep Wrangler (people rent them for trips), minivans near tourist areas.',
          'Buy the newest, lowest-mile example your budget allows. Age and mileage limits creep up on you.',
          'Use the Rental screen: type your budget and your road, and it ranks the candidates and tells you why.',
        ],
      },
      {
        title: 'The numbers to track',
        steps: [
          'Utilisation: days rented divided by days available. Below half, the car is a cost.',
          'Revenue per available day, after the platform share.',
          'Cost per mile: fuel, tyres, oil, brakes, cleaning, spread over the miles renters drive.',
          'Downtime: days in the shop or waiting for parts.',
          'Depreciation: what the car loses in value each month. Rental miles speed it up.',
        ],
      },
      {
        title: 'The first ninety days',
        steps: [
          'Month one: insurance sorted, one car bought at your number, detailed, photographed, listed, first bookings.',
          'Month two: fix what renters complain about, tune your price by day of week, build the cleaning routine.',
          'Month three: look at utilisation and cost per mile. If the car earns more than it costs and you still have time, plan car two. If it does not, sell it into the market you learned.',
        ],
      },
      {
        title: 'Taxes and records',
        steps: [
          'Keep every trip, every expense and every mile in one place from day one.',
          'Talk to an accountant once before year end about depreciation and how the business is taxed.',
        ],
      },
    ],
    checklist: [
      'I have chosen peer-to-peer or my own fleet, and I know why',
      'I have read the platform\'s current eligibility page',
      'I have an insurance quote that covers rental use, in writing',
      'LLC and EIN done, business account open',
      'First car chosen with the Rental screen and bought at my number',
      'Detailed, photographed and listed',
      'Cleaning fee, mileage limit, fuel rule set',
      'Utilisation and cost per mile tracked from day one',
    ],
  },
  {
    id: 'read-listing',
    title: 'Reading a listing like a pro',
    tagline: 'What every badge means, what photos hide, and the phrases that mean run away.',
    level: 'start',
    minutes: 6,
    sections: [
      {
        title: 'Title status, one by one',
        steps: [
          'Clean: no brand on the title. What you want.',
          'Salvage: an insurer declared it a total loss. It cannot be registered until rebuilt and inspected. Starter mode hides these.',
          'Rebuilt (or reconstructed): a salvage car that passed a state inspection. Legal to drive; worth much less; hard to insure fully and hard to resell.',
          'Flood: water damage. Electrical problems for life. Avoid.',
          'Lemon (manufacturer buy-back): repeated defects the maker could not fix. Avoid for a first car.',
          'Parts only / non-repairable: cannot be registered. Never for a beginner.',
          'Unknown: the listing does not say. Ask, and treat it as a red flag until answered.',
        ],
      },
      {
        title: 'Damage words',
        steps: [
          'None: no known damage. Minor: scratches, dings, cosmetic wear. Both fit Starter mode.',
          'Moderate: a collision repair, hail, a bumper and lights. Real money to fix; not for a first car.',
          'Severe: rollover, frame, fire, airbags deployed. Never.',
          'Runs and drives: the seller says it started and moved under its own power at the yard. It does not mean it is road-worthy.',
          'Keys present: obvious, but a missing key on a modern car can cost hundreds.',
        ],
      },
      {
        title: 'Photos that hide things',
        steps: [
          'Wet cars hide paint flaws. Night photos hide everything.',
          'No photo of the odometer, the engine bay or the driver\'s seat is a choice the seller made.',
          'A single fresh panel on an old car, or a shiny bumper on a dull car, is a repair.',
        ],
      },
      {
        title: 'Money words',
        steps: [
          'Current bid is not the price. It is where bidding is right now; expect it to rise, often in the final minutes.',
          'Reserve is the seller\'s secret minimum. "Reserve not met" means the car will not sell at this price.',
          'Buyer fee is charged to the winner on top of the hammer price. Add it before you bid.',
          '"As is" means no warranty and no returns.',
        ],
      },
      {
        title: 'Phrases that mean run away',
        steps: [
          '"Title in hand, will send after payment" from a private seller you have not met.',
          '"Just needs a small fix" with no detail about which fix.',
          '"Selling for a friend" or "for my uncle": the seller may not have the right to sell.',
          '"Ran when parked."',
          'A price far below every comparable car. Gavel flags it. Real cars are rarely given away; scams are.',
        ],
      },
    ],
    checklist: [
      'I know what each title status means',
      'I know the difference between minor and moderate damage',
      'I add the buyer fee before I compare prices',
      'I treat current bid as a floor, not a price',
      'I walk away from the run-away phrases',
    ],
  },
]

export function guideById(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id)
}
