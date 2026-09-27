/**
 * THE CATALOGUE — makes and the models a buyer is likely to want, for the
 * Sniper's pickers. It is a convenience list, not the universe: free text is
 * always allowed, and a model that is not here still matches by name.
 */
export type CatalogMake = { make: string; models: string[] }

export const CATALOG: CatalogMake[] = [
  { make: 'Acura', models: ['Integra', 'TLX', 'MDX', 'RDX', 'NSX'] },
  { make: 'Alfa Romeo', models: ['Giulia', 'Stelvio', '4C'] },
  { make: 'Aston Martin', models: ['Vantage', 'DB9', 'DB11', 'DBS'] },
  { make: 'Audi', models: ['A4', 'A6', 'S4', 'S5', 'RS5', 'RS7', 'Q5', 'Q7', 'TT', 'R8'] },
  { make: 'Bentley', models: ['Continental GT', 'Flying Spur', 'Bentayga'] },
  { make: 'BMW', models: ['3 Series', '5 Series', 'M2', 'M3', 'M4', 'M5', 'X3', 'X5', 'Z4', 'i4'] },
  { make: 'Cadillac', models: ['CT4-V', 'CT5-V', 'CTS-V', 'Escalade'] },
  { make: 'Chevrolet', models: ['Corvette', 'Camaro', 'Silverado', 'Tahoe', 'Suburban', 'Equinox', 'Malibu', 'Bolt'] },
  { make: 'Chrysler', models: ['300', 'Pacifica'] },
  { make: 'Dodge', models: ['Challenger', 'Charger', 'Durango', 'Viper'] },
  { make: 'Ferrari', models: ['California', '458', '488', 'F430', 'Portofino', 'Roma', '812'] },
  { make: 'Ford', models: ['Mustang', 'Mustang GT', 'Mustang Shelby', 'F-150', 'Raptor', 'Bronco', 'Explorer', 'Expedition', 'Focus RS'] },
  { make: 'GMC', models: ['Sierra', 'Yukon', 'Acadia'] },
  { make: 'Honda', models: ['Civic', 'Civic Si', 'Civic Type R', 'Accord', 'CR-V', 'Pilot', 'Odyssey', 'S2000'] },
  { make: 'Hyundai', models: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Genesis Coupe'] },
  { make: 'Infiniti', models: ['G37', 'Q50', 'Q60', 'QX60'] },
  { make: 'Jaguar', models: ['F-Type', 'XF', 'F-Pace'] },
  { make: 'Jeep', models: ['Wrangler', 'Grand Cherokee', 'Gladiator', 'Cherokee'] },
  { make: 'Kia', models: ['Stinger', 'Telluride', 'Sorento', 'Forte'] },
  { make: 'Lamborghini', models: ['Huracan', 'Gallardo', 'Aventador', 'Urus'] },
  { make: 'Land Rover', models: ['Range Rover', 'Range Rover Sport', 'Defender', 'Discovery'] },
  { make: 'Lexus', models: ['IS', 'IS F', 'ES', 'GS', 'RC F', 'LC', 'GX', 'LX', 'RX', 'NX'] },
  { make: 'Maserati', models: ['Ghibli', 'Quattroporte', 'GranTurismo', 'Levante'] },
  { make: 'Mazda', models: ['MX-5 Miata', 'Mazda3', 'Mazda6', 'CX-5', 'RX-8'] },
  { make: 'McLaren', models: ['570S', '600LT', '650S', '720S', 'GT'] },
  { make: 'Mercedes-Benz', models: ['C-Class', 'E-Class', 'S-Class', 'C63 AMG', 'E63 AMG', 'G-Class', 'GLE', 'SL', 'AMG GT'] },
  { make: 'Mini', models: ['Cooper', 'Cooper S', 'Countryman'] },
  { make: 'Nissan', models: ['GT-R', '370Z', '350Z', 'Altima', 'Rogue', 'Frontier', 'Titan'] },
  { make: 'Porsche', models: ['911', '911 Turbo', '911 GT3', 'Cayman', 'Boxster', '718', 'Macan', 'Cayenne', 'Panamera', 'Taycan'] },
  { make: 'Ram', models: ['1500', '2500'] },
  { make: 'Rolls-Royce', models: ['Ghost', 'Wraith', 'Dawn', 'Cullinan'] },
  { make: 'Subaru', models: ['WRX', 'WRX STI', 'BRZ', 'Outback', 'Forester', 'Crosstrek'] },
  { make: 'Tesla', models: ['Model 3', 'Model Y', 'Model S', 'Model X'] },
  { make: 'Toyota', models: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius', 'Sienna', 'Tacoma', 'Tundra', '4Runner', 'Land Cruiser', 'Sequoia', 'Supra', '86'] },
  { make: 'Volkswagen', models: ['Golf GTI', 'Golf R', 'Jetta', 'Tiguan', 'Atlas'] },
  { make: 'Volvo', models: ['XC60', 'XC90', 'S60', 'V60'] },
]

export function modelsFor(make: string): string[] {
  return CATALOG.find((c) => c.make.toLowerCase() === make.trim().toLowerCase())?.models ?? []
}
