/**
 * The demand list — cars widely known to hold value or to sell quickly.
 *
 * This is an EDITABLE starting list, not a promise. Each entry says in one
 * plain sentence why the car is on it. Members can add their own entries in
 * Settings; those are passed in as `extra` and are checked first. Nothing here
 * claims a car will make money, only that buyers tend to look for it.
 *
 * Tiers:
 *   supercar     — exotic cars the owner favours; big money, big repair bills
 *   enthusiast   — sports and performance cars with a loyal following
 *   holds-value  — everyday cars and trucks that keep their price unusually well
 *   rental       — cheap-to-run cars that suit a first rental fleet
 */

export type DemandEntry = {
  make: string
  /** Model names as they appear at the start of a listing's model field. An empty list means every model of the make. */
  models: string[]
  tier: 'supercar' | 'enthusiast' | 'holds-value' | 'rental'
  /** Other kinds the car also belongs to, so a filter for either finds it (a 911 is enthusiast and holds value). */
  also?: Array<'supercar' | 'enthusiast' | 'holds-value' | 'rental'>
  /** One plain sentence. Never a promise of profit. */
  why: string
}

export const DEMAND_LIST: DemandEntry[] = [
  // Supercars — the owner's favourites. Buy only with a specialist inspection.
  { make: 'Lamborghini', models: ['Huracán', 'Gallardo'], tier: 'supercar', why: 'A supercar with steady interest; buyers search for these by name and a clean history matters more than anything.' },
  { make: 'Ferrari', models: ['California', '458', '488'], tier: 'supercar', why: 'A supercar with a large following; the service records and the mileage decide the price, so read them closely.' },
  { make: 'McLaren', models: ['570S', '720S'], tier: 'supercar', why: 'A modern supercar that draws strong interest, though repairs are dealer-only and expensive.' },
  { make: 'Audi', models: ['R8'], tier: 'supercar', also: ['enthusiast'], why: 'A supercar with everyday manners, so it draws both collectors and daily drivers.' },

  // Enthusiast cars.
  { make: 'Porsche', models: ['911 Turbo', '911 GT3', 'GT3', 'GT2'], tier: 'supercar', also: ['enthusiast', 'holds-value'], why: 'The supercar end of the 911 range; the most sought-after Porsches and quick to sell with records.' },
  { make: 'Porsche', models: ['911'], tier: 'enthusiast', also: ['supercar', 'holds-value'], why: 'The sports car people name first; holds value unusually well, and the best ones sell to collectors.' },
  { make: 'Porsche', models: ['Cayman', 'Boxster', '718'], tier: 'enthusiast', also: ['holds-value'], why: 'Widely sought after and holds value unusually well for a sports car.' },
  { make: 'Nissan', models: ['GT-R'], tier: 'supercar', also: ['enthusiast'], why: 'A performance icon with a loyal following; unmodified, well-kept examples are the ones people want.' },
  { make: 'Chevrolet', models: ['Corvette'], tier: 'enthusiast', why: 'A sports car with a very large market of buyers and cheap, plentiful parts.' },
  { make: 'Ford', models: ['Mustang GT', 'Mustang Shelby', 'Shelby'], tier: 'enthusiast', why: 'A huge fan base and cheap parts; GT and Shelby versions sell faster than base models.' },
  { make: 'BMW', models: ['M2', 'M3', 'M4'], tier: 'enthusiast', why: 'Enthusiast favourites that sell quickly when the service history is complete.' },
  { make: 'Honda', models: ['S2000', 'Civic Si', 'Civic Type R'], tier: 'enthusiast', why: 'Reliable, cheap to run and popular with young buyers, so they tend to move fast.' },
  { make: 'Mazda', models: ['MX-5', 'Miata'], tier: 'enthusiast', why: 'A cheap, reliable roadster with a big following; easiest to sell in spring and summer.' },
  { make: 'Toyota', models: ['Supra', '86', 'GR86'], tier: 'enthusiast', why: 'Sports cars with a wide fan base and a reputation for reliability.' },
  { make: 'Lexus', models: ['IS F', 'IS-F'], tier: 'enthusiast', why: 'A rare performance sedan with a small but eager group of buyers.' },
  { make: 'Subaru', models: ['WRX', 'STI', 'BRZ'], tier: 'enthusiast', why: 'Popular with enthusiasts; stock, well-kept examples sell, modified ones sit.' },

  // Holds value: everyday cars and trucks that keep their price unusually well.
  { make: 'Toyota', models: ['Land Cruiser', '4Runner', 'Tacoma', 'Tundra'], tier: 'holds-value', also: ['enthusiast'], why: 'Known for holding value unusually well because they last a very long time.' },
  { make: 'Lexus', models: ['GX', 'LX'], tier: 'holds-value', why: 'Toyota truck underneath with a luxury badge; holds value well and sells to families and off-roaders alike.' },
  { make: 'Jeep', models: ['Wrangler'], tier: 'holds-value', why: 'Holds value unusually well and has a large, loyal market in every state.' },

  // Rental: cheap to run, easy to fix, steady demand on rental apps.
  { make: 'Tesla', models: ['Model 3', 'Model Y'], tier: 'rental', why: 'Popular on peer-to-peer rental apps because charging is cheap and there is little to service.' },
  { make: 'Toyota', models: ['Camry', 'Corolla', 'RAV4', 'Prius', 'Sienna'], tier: 'rental', also: ['holds-value'], why: 'Reliable and cheap to fix, with steady demand as rentals and family cars.' },
  { make: 'Honda', models: ['Civic', 'Accord', 'CR-V', 'Odyssey'], tier: 'rental', why: 'Reliable and easy to rent or resell; parts and mechanics are everywhere.' },
]

/** Nicknames people type for a make. */
const MAKE_ALIASES: Record<string, string> = {
  chevy: 'chevrolet',
  mercedes: 'mercedes-benz',
  vw: 'volkswagen',
}

/** Lower-case, trimmed, accents removed ("Huracán" → "huracan"), one space between words. */
function norm(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function normMake(s: string | undefined): string {
  const m = norm(s)
  return MAKE_ALIASES[m] ?? m
}

/**
 * Find the demand entry for a make and model, if any. Case-insensitive.
 * A model matches when either name is a prefix of the other ("911 Carrera S"
 * matches "911"; "Civic" matches "Civic Si"). When several entries match, the
 * most specific one wins (exact name, then the longest shared start), so a
 * plain "Civic" lands on the rental entry, not the Civic Si one.
 * `extra` entries (added by a member) are checked before the built-in list.
 */
export function demandFor(make?: string, model?: string, extra: DemandEntry[] = []): DemandEntry | undefined {
  const mk = normMake(make)
  if (!mk) return undefined
  const md = norm(model)
  const entries = [...extra, ...DEMAND_LIST]

  let best: { entry: DemandEntry; rank: number; order: number } | undefined
  entries.forEach((entry, order) => {
    if (normMake(entry.make) !== mk) return
    if (entry.models.length === 0) {
      // A whole-make entry matches any model, weakly.
      consider(entry, 1, order)
      return
    }
    if (!md) return
    for (const em of entry.models) {
      const e = norm(em)
      if (!e) continue
      if (e === md) consider(entry, 1000 + e.length, order)
      else if (md.startsWith(e) || e.startsWith(md)) consider(entry, 10 + Math.min(e.length, md.length), order)
    }
  })
  return best?.entry

  function consider(entry: DemandEntry, rank: number, order: number): void {
    if (!best || rank > best.rank || (rank === best.rank && order < best.order)) best = { entry, rank, order }
  }
}
