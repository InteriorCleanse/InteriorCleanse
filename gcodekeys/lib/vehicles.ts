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
    { name: '4Runner', years: y(2010), family: 'remotehead' }, { name: 'Prius', years: y(2010), family: 'smart' },
    { name: 'Sienna', years: y(2011), family: 'smart' }, { name: 'Sequoia', years: y(2008), family: 'remotehead' },
    { name: 'Avalon', years: y(2013), family: 'smart' }, { name: 'GR86 / 86', years: y(2017), family: 'remotehead' },
    { name: 'Supra', years: y(2020), family: 'bmw' },
  ]},
  { name: 'Honda', tier: 'mainstream', family: 'smart', models: [
    { name: 'Civic', years: y(2016), family: 'smart' }, { name: 'Accord', years: y(2013), family: 'smart' },
    { name: 'CR-V', years: y(2015), family: 'smart' }, { name: 'Pilot', years: y(2016), family: 'smart' },
    { name: 'Odyssey', years: y(2014), family: 'smart' }, { name: 'HR-V', years: y(2016), family: 'smart' },
    { name: 'Ridgeline', years: y(2017), family: 'smart' }, { name: 'Passport', years: y(2019), family: 'smart' },
    { name: 'Fit', years: y(2015, 2020), family: 'remotehead' },
  ]},
  { name: 'Ford', tier: 'mainstream', family: 'remotehead', models: [
    { name: 'F-150', years: y(2015), family: 'remotehead' }, { name: 'F-250 / F-350', years: y(2017), family: 'remotehead' },
    { name: 'Mustang', years: y(2015), family: 'smart' }, { name: 'Mustang Mach-E', years: y(2021), family: 'smart' },
    { name: 'Explorer', years: y(2016), family: 'smart' }, { name: 'Escape', years: y(2017), family: 'remotehead' },
    { name: 'Bronco', years: y(2021), family: 'smart' }, { name: 'Bronco Sport', years: y(2021), family: 'smart' },
    { name: 'Edge', years: y(2015), family: 'smart' }, { name: 'Ranger', years: y(2019), family: 'remotehead' },
    { name: 'Expedition', years: y(2018), family: 'smart' }, { name: 'Maverick', years: y(2022), family: 'remotehead' },
  ]},
  { name: 'Chevrolet', tier: 'mainstream', family: 'smart', models: [
    { name: 'Silverado', years: y(2014), family: 'remotehead' }, { name: 'Equinox', years: y(2018), family: 'smart' },
    { name: 'Malibu', years: y(2016), family: 'smart' }, { name: 'Tahoe', years: y(2015), family: 'smart' },
    { name: 'Corvette', years: y(2014), family: 'smart' }, { name: 'Suburban', years: y(2015), family: 'smart' },
    { name: 'Traverse', years: y(2018), family: 'smart' }, { name: 'Colorado', years: y(2015), family: 'remotehead' },
    { name: 'Blazer', years: y(2019), family: 'smart' }, { name: 'Camaro', years: y(2016), family: 'smart' },
    { name: 'Bolt EV / EUV', years: y(2017), family: 'remotehead' },
  ]},
  { name: 'GMC', tier: 'mainstream', family: 'smart', models: [
    { name: 'Sierra', years: y(2014), family: 'remotehead' }, { name: 'Yukon', years: y(2015), family: 'smart' },
    { name: 'Acadia', years: y(2017), family: 'smart' }, { name: 'Terrain', years: y(2018), family: 'smart' },
    { name: 'Canyon', years: y(2015), family: 'remotehead' }, { name: 'Hummer EV', years: y(2022), family: 'smart' },
  ]},
  { name: 'Ram', tier: 'mainstream', family: 'smart', models: [
    { name: '1500', years: y(2013), family: 'smart' }, { name: '2500 / 3500', years: y(2019), family: 'smart' },
    { name: 'ProMaster', years: y(2014), family: 'flip' },
  ]},
  { name: 'Dodge', tier: 'mainstream', family: 'smart', models: [
    { name: 'Charger', years: y(2011), family: 'smart' }, { name: 'Challenger', years: y(2011), family: 'smart' },
    { name: 'Durango', years: y(2014), family: 'smart' }, { name: 'Journey', years: y(2011, 2020), family: 'flip' },
  ]},
  { name: 'Chrysler', tier: 'mainstream', family: 'smart', models: [
    { name: '300', years: y(2011), family: 'smart' }, { name: 'Pacifica', years: y(2017), family: 'smart' },
    { name: 'Voyager', years: y(2020), family: 'smart' },
  ]},
  { name: 'Buick', tier: 'mainstream', family: 'smart', models: [
    { name: 'Enclave', years: y(2018), family: 'smart' }, { name: 'Encore', years: y(2016), family: 'smart' },
    { name: 'Envision', years: y(2016), family: 'smart' },
  ]},
  { name: 'Nissan', tier: 'mainstream', family: 'smart', models: [
    { name: 'Altima', years: y(2013), family: 'smart' }, { name: 'Rogue', years: y(2014), family: 'smart' },
    { name: 'Sentra', years: y(2013), family: 'smart' }, { name: 'Frontier', years: y(2022), family: 'smart' },
    { name: 'Maxima', years: y(2016), family: 'smart' }, { name: 'Pathfinder', years: y(2013), family: 'smart' },
    { name: 'Murano', years: y(2015), family: 'smart' }, { name: 'Titan', years: y(2016), family: 'smart' },
    { name: 'Kicks', years: y(2018), family: 'remotehead' }, { name: 'Z / 370Z', years: y(2009), family: 'remotehead' },
    { name: 'Leaf', years: y(2011), family: 'smart' },
  ]},
  { name: 'Hyundai', tier: 'mainstream', family: 'smart', models: [
    { name: 'Elantra', years: y(2017), family: 'smart' }, { name: 'Sonata', years: y(2015), family: 'smart' },
    { name: 'Tucson', years: y(2016), family: 'smart' }, { name: 'Santa Fe', years: y(2017), family: 'smart' },
    { name: 'Palisade', years: y(2020), family: 'smart' }, { name: 'Kona', years: y(2018), family: 'remotehead' },
    { name: 'Ioniq 5', years: y(2022), family: 'smart' }, { name: 'Venue', years: y(2020), family: 'remotehead' },
  ]},
  { name: 'Kia', tier: 'mainstream', family: 'smart', models: [
    { name: 'Optima / K5', years: y(2016), family: 'smart' }, { name: 'Sorento', years: y(2016), family: 'smart' },
    { name: 'Sportage', years: y(2017), family: 'smart' }, { name: 'Telluride', years: y(2020), family: 'smart' },
    { name: 'Soul', years: y(2014), family: 'remotehead' }, { name: 'Forte', years: y(2019), family: 'remotehead' },
    { name: 'Seltos', years: y(2021), family: 'smart' }, { name: 'EV6', years: y(2022), family: 'smart' }, { name: 'Carnival', years: y(2022), family: 'smart' },
  ]},
  { name: 'Genesis', tier: 'luxury', family: 'smart', models: [
    { name: 'G70', years: y(2019), family: 'smart' }, { name: 'G80', years: y(2017), family: 'smart' },
    { name: 'G90', years: y(2017), family: 'smart' }, { name: 'GV70', years: y(2022), family: 'smart' }, { name: 'GV80', years: y(2021), family: 'smart' },
  ]},
  { name: 'Jeep', tier: 'mainstream', family: 'smart', models: [
    { name: 'Wrangler', years: y(2018), family: 'smart' }, { name: 'Grand Cherokee', years: y(2014), family: 'flip' },
    { name: 'Cherokee', years: y(2014), family: 'flip' }, { name: 'Gladiator', years: y(2020), family: 'smart' },
    { name: 'Compass', years: y(2017), family: 'flip' }, { name: 'Renegade', years: y(2015), family: 'flip' },
    { name: 'Grand Wagoneer', years: y(2022), family: 'smart' },
  ]},
  { name: 'Subaru', tier: 'mainstream', family: 'smart', models: [
    { name: 'Outback', years: y(2015), family: 'smart' }, { name: 'Forester', years: y(2015), family: 'smart' },
    { name: 'Impreza', years: y(2017), family: 'smart' }, { name: 'WRX', years: y(2015), family: 'smart' },
    { name: 'Crosstrek', years: y(2018), family: 'smart' }, { name: 'Ascent', years: y(2019), family: 'smart' },
    { name: 'Legacy', years: y(2015), family: 'smart' }, { name: 'BRZ', years: y(2017), family: 'remotehead' },
  ]},
  { name: 'Mazda', tier: 'mainstream', family: 'smart', models: [
    { name: 'Mazda3', years: y(2014), family: 'smart' }, { name: 'CX-5', years: y(2013), family: 'smart' },
    { name: 'CX-9', years: y(2016), family: 'smart' }, { name: 'MX-5 Miata', years: y(2016), family: 'smart' },
    { name: 'CX-30', years: y(2020), family: 'smart' }, { name: 'CX-50', years: y(2023), family: 'smart' }, { name: 'CX-90', years: y(2024), family: 'smart' },
  ]},
  { name: 'Volkswagen', tier: 'mainstream', family: 'flip', models: [
    { name: 'Golf / GTI', years: y(2015), family: 'flip' }, { name: 'Jetta', years: y(2019), family: 'flip' },
    { name: 'Tiguan', years: y(2018), family: 'smart' }, { name: 'Atlas', years: y(2018), family: 'smart' },
    { name: 'Passat', years: y(2012, 2022), family: 'flip' }, { name: 'Taos', years: y(2022), family: 'smart' }, { name: 'ID.4', years: y(2021), family: 'smart' },
  ]},
  { name: 'Mitsubishi', tier: 'mainstream', family: 'flip', models: [
    { name: 'Outlander', years: y(2014), family: 'flip' }, { name: 'Eclipse Cross', years: y(2018), family: 'flip' }, { name: 'Mirage', years: y(2014), family: 'remotehead' },
  ]},
  { name: 'Volvo', tier: 'luxury', family: 'smart', models: [
    { name: 'XC40', years: y(2019), family: 'smart' }, { name: 'XC60', years: y(2018), family: 'smart' },
    { name: 'XC90', years: y(2016), family: 'smart' }, { name: 'S60', years: y(2019), family: 'smart' }, { name: 'S90', years: y(2017), family: 'smart' },
  ]},
  { name: 'MINI', tier: 'luxury', family: 'bmw', models: [
    { name: 'Cooper / Hardtop', years: y(2014), family: 'bmw' }, { name: 'Countryman', years: y(2017), family: 'bmw' }, { name: 'Clubman', years: y(2016), family: 'bmw' },
  ]},
  { name: 'Fiat', tier: 'mainstream', family: 'flip', models: [
    { name: '500', years: y(2012, 2019), family: 'flip' }, { name: '500X', years: y(2016), family: 'flip' },
  ]},
  { name: 'Alfa Romeo', tier: 'luxury', family: 'smart', models: [
    { name: 'Giulia', years: y(2017), family: 'smart' }, { name: 'Stelvio', years: y(2018), family: 'smart' },
  ]},
  { name: 'Tesla', tier: 'mainstream', family: 'luxury', models: [
    { name: 'Model 3', years: y(2017), family: 'luxury' }, { name: 'Model Y', years: y(2020), family: 'luxury' },
    { name: 'Model S', years: y(2012), family: 'luxury' }, { name: 'Model X', years: y(2016), family: 'luxury' }, { name: 'Cybertruck', years: y(2024), family: 'luxury' },
  ]},
  { name: 'Rivian', tier: 'luxury', family: 'smart', models: [
    { name: 'R1T', years: y(2022), family: 'smart' }, { name: 'R1S', years: y(2022), family: 'smart' },
  ]},
  { name: 'Lucid', tier: 'luxury', family: 'smart', models: [
    { name: 'Air', years: y(2022), family: 'smart' }, { name: 'Gravity', years: y(2025), family: 'smart' },
  ]},
  { name: 'Polestar', tier: 'luxury', family: 'smart', models: [
    { name: 'Polestar 2', years: y(2021), family: 'smart' }, { name: 'Polestar 3', years: y(2024), family: 'smart' },
  ]},

  // ── Luxury ──
  { name: 'BMW', tier: 'luxury', family: 'bmw', models: [
    { name: '2 Series', years: y(2014), family: 'bmw' }, { name: '3 Series', years: y(2012), family: 'bmw' },
    { name: '4 Series', years: y(2014), family: 'bmw' }, { name: '5 Series', years: y(2011), family: 'bmw' },
    { name: '7 Series', years: y(2010), family: 'bmw' }, { name: 'X1', years: y(2016), family: 'bmw' },
    { name: 'X3', years: y(2018), family: 'bmw' }, { name: 'X5', years: y(2014), family: 'bmw' },
    { name: 'X7', years: y(2019), family: 'bmw' }, { name: 'M3 / M4', years: y(2015), family: 'bmw' }, { name: 'i4 / iX', years: y(2022), family: 'bmw' },
  ]},
  { name: 'Mercedes-Benz', tier: 'luxury', family: 'mercedes', models: [
    { name: 'A-Class', years: y(2019), family: 'mercedes' }, { name: 'C-Class', years: y(2008, 2014), family: 'mercedes' },
    { name: 'E-Class', years: y(2010, 2016), family: 'mercedes' }, { name: 'S-Class', years: y(2007, 2013), family: 'mercedes' },
    { name: 'GLA', years: y(2015), family: 'mercedes' }, { name: 'GLC', years: y(2016), family: 'mercedes' },
    { name: 'GLE', years: y(2016), family: 'mercedes' }, { name: 'GLS', years: y(2017), family: 'mercedes' },
    { name: 'G-Class', years: y(2013), family: 'mercedes' }, { name: 'AMG GT', years: y(2016), family: 'mercedes' },
  ]},
  { name: 'Maybach', tier: 'luxury', family: 'mercedes', models: [
    { name: 'S-Class', years: y(2016), family: 'mercedes' }, { name: 'GLS', years: y(2021), family: 'mercedes' },
  ]},
  { name: 'Audi', tier: 'luxury', family: 'flip', models: [
    { name: 'A3', years: y(2015), family: 'flip' }, { name: 'A4', years: y(2017), family: 'smart' },
    { name: 'A5', years: y(2018), family: 'smart' }, { name: 'A6', years: y(2012), family: 'flip' },
    { name: 'A7', years: y(2012), family: 'smart' }, { name: 'A8', years: y(2011), family: 'smart' },
    { name: 'Q3', years: y(2019), family: 'smart' }, { name: 'Q5', years: y(2018), family: 'smart' },
    { name: 'Q7', years: y(2017), family: 'smart' }, { name: 'Q8 / e-tron', years: y(2019), family: 'smart' }, { name: 'RS / S', years: y(2016), family: 'smart' },
  ]},
  { name: 'Lexus', tier: 'luxury', family: 'luxury', models: [
    { name: 'ES', years: y(2013), family: 'luxury' }, { name: 'IS', years: y(2014), family: 'luxury' },
    { name: 'RX', years: y(2016), family: 'luxury' }, { name: 'NX', years: y(2015), family: 'luxury' },
    { name: 'GX', years: y(2014), family: 'luxury' }, { name: 'LX', years: y(2016), family: 'luxury' },
    { name: 'LS', years: y(2013), family: 'luxury' }, { name: 'UX', years: y(2019), family: 'luxury' }, { name: 'RC / LC', years: y(2015), family: 'luxury' },
  ]},
  { name: 'Acura', tier: 'luxury', family: 'smart', models: [
    { name: 'TLX', years: y(2015), family: 'smart' }, { name: 'MDX', years: y(2014), family: 'smart' },
    { name: 'RDX', years: y(2016), family: 'smart' }, { name: 'ILX', years: y(2013, 2022), family: 'smart' }, { name: 'Integra', years: y(2023), family: 'smart' },
  ]},
  { name: 'Infiniti', tier: 'luxury', family: 'smart', models: [
    { name: 'Q50', years: y(2014), family: 'smart' }, { name: 'Q60', years: y(2017), family: 'smart' },
    { name: 'QX50', years: y(2019), family: 'smart' }, { name: 'QX60', years: y(2014), family: 'smart' }, { name: 'QX80', years: y(2014), family: 'smart' },
  ]},
  { name: 'Cadillac', tier: 'luxury', family: 'smart', models: [
    { name: 'Escalade', years: y(2015), family: 'smart' }, { name: 'CT4', years: y(2020), family: 'smart' },
    { name: 'CT5', years: y(2020), family: 'smart' }, { name: 'XT4', years: y(2019), family: 'smart' },
    { name: 'XT5', years: y(2017), family: 'smart' }, { name: 'XT6', years: y(2020), family: 'smart' }, { name: 'Lyriq', years: y(2023), family: 'smart' },
  ]},
  { name: 'Lincoln', tier: 'luxury', family: 'smart', models: [
    { name: 'Navigator', years: y(2018), family: 'smart' }, { name: 'Aviator', years: y(2020), family: 'smart' },
    { name: 'Corsair', years: y(2020), family: 'smart' }, { name: 'Nautilus', years: y(2019), family: 'smart' },
  ]},
  { name: 'Porsche', tier: 'luxury', family: 'porsche', models: [
    { name: '911', years: y(2012), family: 'porsche' }, { name: '718 Cayman / Boxster', years: y(2017), family: 'porsche' },
    { name: 'Cayenne', years: y(2011), family: 'porsche' }, { name: 'Macan', years: y(2015), family: 'porsche' },
    { name: 'Panamera', years: y(2010), family: 'porsche' }, { name: 'Taycan', years: y(2020), family: 'porsche' },
  ]},
  { name: 'Jaguar', tier: 'luxury', family: 'luxury', models: [
    { name: 'F-Pace', years: y(2017), family: 'luxury' }, { name: 'E-Pace', years: y(2018), family: 'luxury' },
    { name: 'XF', years: y(2016), family: 'luxury' }, { name: 'XE', years: y(2017), family: 'luxury' },
    { name: 'F-Type', years: y(2014), family: 'luxury' }, { name: 'I-Pace', years: y(2019), family: 'luxury' },
  ]},
  { name: 'Land Rover', tier: 'luxury', family: 'luxury', models: [
    { name: 'Range Rover', years: y(2013), family: 'luxury' }, { name: 'Range Rover Sport', years: y(2014), family: 'luxury' },
    { name: 'Range Rover Velar', years: y(2018), family: 'luxury' }, { name: 'Range Rover Evoque', years: y(2012), family: 'luxury' },
    { name: 'Discovery', years: y(2017), family: 'luxury' }, { name: 'Defender', years: y(2020), family: 'luxury' },
  ]},
  { name: 'Maserati', tier: 'luxury', family: 'luxury', models: [
    { name: 'Ghibli', years: y(2014), family: 'luxury' }, { name: 'Levante', years: y(2017), family: 'luxury' },
    { name: 'Quattroporte', years: y(2013), family: 'luxury' }, { name: 'Grecale', years: y(2023), family: 'luxury' }, { name: 'MC20', years: y(2021), family: 'supercar' },
  ]},
  { name: 'Bentley', tier: 'luxury', family: 'luxury', models: [
    { name: 'Continental GT', years: y(2012), family: 'luxury' }, { name: 'Bentayga', years: y(2016), family: 'luxury' }, { name: 'Flying Spur', years: y(2013), family: 'luxury' },
  ]},
  { name: 'Rolls-Royce', tier: 'luxury', family: 'luxury', models: [
    { name: 'Ghost', years: y(2010), family: 'luxury' }, { name: 'Phantom', years: y(2018), family: 'luxury' },
    { name: 'Cullinan', years: y(2019), family: 'luxury' }, { name: 'Wraith', years: y(2014), family: 'luxury' }, { name: 'Spectre', years: y(2024), family: 'luxury' },
  ]},
  { name: 'Aston Martin', tier: 'luxury', family: 'luxury', models: [
    { name: 'DB11', years: y(2017), family: 'luxury' }, { name: 'DB12', years: y(2024), family: 'luxury' },
    { name: 'Vantage', years: y(2019), family: 'luxury' }, { name: 'DBX', years: y(2021), family: 'luxury' }, { name: 'DBS', years: y(2019), family: 'luxury' },
  ]},

  // ── Supercar / exotic ──
  { name: 'Ferrari', tier: 'supercar', family: 'supercar', models: [
    { name: '488 / F8', years: y(2016), family: 'supercar' }, { name: 'Roma', years: y(2021), family: 'supercar' },
    { name: 'SF90', years: y(2021), family: 'supercar' }, { name: '812', years: y(2018), family: 'supercar' },
    { name: 'Portofino', years: y(2018), family: 'supercar' }, { name: '296 GTB', years: y(2022), family: 'supercar' }, { name: 'Purosangue', years: y(2023), family: 'supercar' },
  ]},
  { name: 'Lamborghini', tier: 'supercar', family: 'supercar', models: [
    { name: 'Huracán', years: y(2015), family: 'supercar' }, { name: 'Aventador', years: y(2012), family: 'supercar' },
    { name: 'Urus', years: y(2018), family: 'supercar' }, { name: 'Revuelto', years: y(2024), family: 'supercar' }, { name: 'Gallardo', years: y(2004, 2014), family: 'supercar' },
  ]},
  { name: 'McLaren', tier: 'supercar', family: 'supercar', models: [
    { name: '720S / 750S', years: y(2018), family: 'supercar' }, { name: 'Artura', years: y(2022), family: 'supercar' },
    { name: 'GT', years: y(2020), family: 'supercar' }, { name: '765LT', years: y(2021), family: 'supercar' }, { name: '570S / 600LT', years: y(2016), family: 'supercar' },
  ]},
  { name: 'Bugatti', tier: 'supercar', family: 'supercar', models: [
    { name: 'Chiron', years: y(2016), family: 'supercar' }, { name: 'Veyron', years: y(2005, 2015), family: 'supercar' }, { name: 'Tourbillon', years: y(2026), family: 'supercar' },
  ]},
  { name: 'Lotus', tier: 'supercar', family: 'supercar', models: [
    { name: 'Emira', years: y(2022), family: 'supercar' }, { name: 'Evija', years: y(2023), family: 'supercar' }, { name: 'Eletre', years: y(2024), family: 'supercar' },
  ]},
  { name: 'Koenigsegg', tier: 'supercar', family: 'supercar', models: [
    { name: 'Jesko', years: y(2023), family: 'supercar' }, { name: 'Gemera', years: y(2024), family: 'supercar' }, { name: 'Regera', years: y(2016, 2022), family: 'supercar' },
  ]},
  { name: 'Pagani', tier: 'supercar', family: 'supercar', models: [
    { name: 'Huayra', years: y(2012), family: 'supercar' }, { name: 'Utopia', years: y(2024), family: 'supercar' },
  ]},
  { name: 'Rimac', tier: 'supercar', family: 'supercar', models: [
    { name: 'Nevera', years: y(2022), family: 'supercar' },
  ]},
]

export function yearsFor(model: Model): number[] {
  const [a, b] = model.years
  const out: number[] = []
  for (let yr = b; yr >= a; yr--) out.push(yr)
  return out
}
