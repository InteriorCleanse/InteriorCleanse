import type { FamilyId } from './keyFamilies'

export type Tier = 'mainstream' | 'luxury' | 'supercar'
export type Model = { name: string; years: [number, number]; family: FamilyId }
export type Make = { name: string; tier: Tier; family: FamilyId; models: Model[] }

// Curated dataset. Year/family at make level with per-model overrides where the
// key shape differs (e.g., older remote-head vs newer smart). Enter a VIN on the
// home page for the precise match; this powers the visual selector.
const y = (a: number, b = 2026): [number, number] => [a, b]

export const MAKES: Make[] = [
  // ── Mainstream ──
  { name: 'Toyota', tier: 'mainstream', family: 'smart', models: [
    { name: 'Camry', years: y(2012), family: 'smart' }, { name: 'Corolla', years: y(2014), family: 'smart' },
    { name: 'RAV4', years: y(2013), family: 'smart' }, { name: 'Tacoma', years: y(2016), family: 'remotehead' },
    { name: 'Tundra', years: y(2014), family: 'remotehead' }, { name: 'Highlander', years: y(2014), family: 'smart' },
  ]},
  { name: 'Honda', tier: 'mainstream', family: 'smart', models: [
    { name: 'Civic', years: y(2016), family: 'smart' }, { name: 'Accord', years: y(2013), family: 'smart' },
    { name: 'CR-V', years: y(2015), family: 'smart' }, { name: 'Pilot', years: y(2016), family: 'smart' },
    { name: 'Odyssey', years: y(2014), family: 'smart' },
  ]},
  { name: 'Ford', tier: 'mainstream', family: 'remotehead', models: [
    { name: 'F-150', years: y(2015), family: 'remotehead' }, { name: 'Mustang', years: y(2015), family: 'smart' },
    { name: 'Explorer', years: y(2016), family: 'smart' }, { name: 'Escape', years: y(2017), family: 'remotehead' },
    { name: 'Bronco', years: y(2021), family: 'smart' },
  ]},
  { name: 'Chevrolet', tier: 'mainstream', family: 'smart', models: [
    { name: 'Silverado', years: y(2014), family: 'remotehead' }, { name: 'Equinox', years: y(2018), family: 'smart' },
    { name: 'Malibu', years: y(2016), family: 'smart' }, { name: 'Tahoe', years: y(2015), family: 'smart' },
    { name: 'Corvette', years: y(2014), family: 'smart' },
  ]},
  { name: 'Nissan', tier: 'mainstream', family: 'smart', models: [
    { name: 'Altima', years: y(2013), family: 'smart' }, { name: 'Rogue', years: y(2014), family: 'smart' },
    { name: 'Sentra', years: y(2013), family: 'smart' }, { name: 'Frontier', years: y(2022), family: 'smart' },
  ]},
  { name: 'Hyundai', tier: 'mainstream', family: 'smart', models: [
    { name: 'Elantra', years: y(2017), family: 'smart' }, { name: 'Sonata', years: y(2015), family: 'smart' },
    { name: 'Tucson', years: y(2016), family: 'smart' }, { name: 'Santa Fe', years: y(2017), family: 'smart' },
  ]},
  { name: 'Kia', tier: 'mainstream', family: 'smart', models: [
    { name: 'Optima', years: y(2016), family: 'smart' }, { name: 'Sorento', years: y(2016), family: 'smart' },
    { name: 'Sportage', years: y(2017), family: 'smart' }, { name: 'Telluride', years: y(2020), family: 'smart' },
  ]},
  { name: 'Jeep', tier: 'mainstream', family: 'smart', models: [
    { name: 'Wrangler', years: y(2018), family: 'smart' }, { name: 'Grand Cherokee', years: y(2014), family: 'flip' },
    { name: 'Cherokee', years: y(2014), family: 'flip' }, { name: 'Gladiator', years: y(2020), family: 'smart' },
  ]},
  { name: 'Subaru', tier: 'mainstream', family: 'smart', models: [
    { name: 'Outback', years: y(2015), family: 'smart' }, { name: 'Forester', years: y(2015), family: 'smart' },
    { name: 'Impreza', years: y(2017), family: 'smart' }, { name: 'WRX', years: y(2015), family: 'smart' },
  ]},
  { name: 'Mazda', tier: 'mainstream', family: 'smart', models: [
    { name: 'Mazda3', years: y(2014), family: 'smart' }, { name: 'CX-5', years: y(2013), family: 'smart' },
    { name: 'CX-9', years: y(2016), family: 'smart' }, { name: 'MX-5 Miata', years: y(2016), family: 'smart' },
  ]},
  { name: 'Volkswagen', tier: 'mainstream', family: 'flip', models: [
    { name: 'Golf / GTI', years: y(2015), family: 'flip' }, { name: 'Jetta', years: y(2019), family: 'flip' },
    { name: 'Tiguan', years: y(2018), family: 'smart' }, { name: 'Atlas', years: y(2018), family: 'smart' },
  ]},
  { name: 'Tesla', tier: 'mainstream', family: 'luxury', models: [
    { name: 'Model 3', years: y(2017), family: 'luxury' }, { name: 'Model Y', years: y(2020), family: 'luxury' },
    { name: 'Model S', years: y(2012), family: 'luxury' }, { name: 'Model X', years: y(2016), family: 'luxury' },
  ]},

  // ── Luxury ──
  { name: 'BMW', tier: 'luxury', family: 'bmw', models: [
    { name: '3 Series', years: y(2012), family: 'bmw' }, { name: '5 Series', years: y(2011), family: 'bmw' },
    { name: 'X5', years: y(2014), family: 'bmw' }, { name: 'X3', years: y(2018), family: 'bmw' }, { name: 'M3 / M4', years: y(2015), family: 'bmw' },
  ]},
  { name: 'Mercedes-Benz', tier: 'luxury', family: 'mercedes', models: [
    { name: 'C-Class', years: y(2008, 2014), family: 'mercedes' }, { name: 'E-Class', years: y(2010, 2016), family: 'mercedes' },
    { name: 'GLC', years: y(2016), family: 'mercedes' }, { name: 'S-Class', years: y(2007, 2013), family: 'mercedes' },
  ]},
  { name: 'Audi', tier: 'luxury', family: 'flip', models: [
    { name: 'A4', years: y(2017), family: 'smart' }, { name: 'A6', years: y(2012), family: 'flip' },
    { name: 'Q5', years: y(2018), family: 'smart' }, { name: 'Q7', years: y(2017), family: 'smart' }, { name: 'RS / S', years: y(2016), family: 'smart' },
  ]},
  { name: 'Lexus', tier: 'luxury', family: 'luxury', models: [
    { name: 'ES', years: y(2013), family: 'luxury' }, { name: 'RX', years: y(2016), family: 'luxury' },
    { name: 'IS', years: y(2014), family: 'luxury' }, { name: 'GX', years: y(2014), family: 'luxury' },
  ]},
  { name: 'Porsche', tier: 'luxury', family: 'porsche', models: [
    { name: '911', years: y(2012), family: 'porsche' }, { name: 'Cayenne', years: y(2011), family: 'porsche' },
    { name: 'Macan', years: y(2015), family: 'porsche' }, { name: 'Panamera', years: y(2010), family: 'porsche' }, { name: 'Taycan', years: y(2020), family: 'porsche' },
  ]},
  { name: 'Jaguar', tier: 'luxury', family: 'luxury', models: [
    { name: 'F-Pace', years: y(2017), family: 'luxury' }, { name: 'XF', years: y(2016), family: 'luxury' }, { name: 'F-Type', years: y(2014), family: 'luxury' },
  ]},
  { name: 'Land Rover', tier: 'luxury', family: 'luxury', models: [
    { name: 'Range Rover', years: y(2013), family: 'luxury' }, { name: 'Range Rover Sport', years: y(2014), family: 'luxury' }, { name: 'Defender', years: y(2020), family: 'luxury' },
  ]},
  { name: 'Maserati', tier: 'luxury', family: 'luxury', models: [
    { name: 'Ghibli', years: y(2014), family: 'luxury' }, { name: 'Levante', years: y(2017), family: 'luxury' }, { name: 'Quattroporte', years: y(2013), family: 'luxury' },
  ]},
  { name: 'Bentley', tier: 'luxury', family: 'luxury', models: [
    { name: 'Continental GT', years: y(2012), family: 'luxury' }, { name: 'Bentayga', years: y(2016), family: 'luxury' }, { name: 'Flying Spur', years: y(2013), family: 'luxury' },
  ]},
  { name: 'Rolls-Royce', tier: 'luxury', family: 'luxury', models: [
    { name: 'Ghost', years: y(2010), family: 'luxury' }, { name: 'Cullinan', years: y(2019), family: 'luxury' }, { name: 'Wraith', years: y(2014), family: 'luxury' },
  ]},
  { name: 'Aston Martin', tier: 'luxury', family: 'luxury', models: [
    { name: 'DB11', years: y(2017), family: 'luxury' }, { name: 'Vantage', years: y(2019), family: 'luxury' }, { name: 'DBX', years: y(2021), family: 'luxury' },
  ]},

  // ── Supercar ──
  { name: 'Ferrari', tier: 'supercar', family: 'supercar', models: [
    { name: '488 / F8', years: y(2016), family: 'supercar' }, { name: 'Roma', years: y(2021), family: 'supercar' },
    { name: 'SF90', years: y(2021), family: 'supercar' }, { name: '812', years: y(2018), family: 'supercar' }, { name: 'Portofino', years: y(2018), family: 'supercar' },
  ]},
  { name: 'Lamborghini', tier: 'supercar', family: 'supercar', models: [
    { name: 'Huracán', years: y(2015), family: 'supercar' }, { name: 'Aventador', years: y(2012), family: 'supercar' },
    { name: 'Urus', years: y(2018), family: 'supercar' }, { name: 'Revuelto', years: y(2024), family: 'supercar' },
  ]},
  { name: 'McLaren', tier: 'supercar', family: 'supercar', models: [
    { name: '720S', years: y(2018), family: 'supercar' }, { name: 'Artura', years: y(2022), family: 'supercar' }, { name: 'GT', years: y(2020), family: 'supercar' }, { name: '765LT', years: y(2021), family: 'supercar' },
  ]},
  { name: 'Bugatti', tier: 'supercar', family: 'supercar', models: [
    { name: 'Chiron', years: y(2016), family: 'supercar' }, { name: 'Veyron', years: y(2005, 2015), family: 'supercar' },
  ]},
]

export function yearsFor(model: Model): number[] {
  const [a, b] = model.years
  const out: number[] = []
  for (let yr = b; yr >= a; yr--) out.push(yr)
  return out
}
