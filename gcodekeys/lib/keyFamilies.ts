// Key "families" — the distinct physical fob shapes we render in the studio.
// These are faithful stylized representations, not OEM artwork; we customize
// color, finish, engraving and covers on real OEM or aftermarket-compatible
// parts and never reproduce a maker's logo for resale.

export type FamilyId =
  | 'smart' | 'remotehead' | 'flip' | 'bmw' | 'mercedes' | 'porsche' | 'supercar' | 'luxury'

export type KeyTypeOption = { id: string; label: string; base: number }

export type Family = {
  id: FamilyId
  label: string
  // Example flat prices (USD) to replace with the operator's real table.
  types: KeyTypeOption[]
  // How this family is fulfilled.
  fulfillment: 'aftermarket' | 'oem' | 'dealer-coordinated'
  note: string
}

export const FAMILIES: Record<FamilyId, Family> = {
  smart: {
    id: 'smart', label: 'Smart key (push-to-start)', fulfillment: 'aftermarket',
    types: [{ id: 'shell', label: 'Shell only', base: 49 }, { id: 'smart', label: 'Smart key, cut & coded', base: 229 }, { id: 'spare', label: 'Spare smart key', base: 199 }],
    note: 'Cut and coded on site via OBD. All-keys-lost supported on most models.',
  },
  remotehead: {
    id: 'remotehead', label: 'Remote-head key', fulfillment: 'aftermarket',
    types: [{ id: 'shell', label: 'Shell only', base: 29 }, { id: 'remote', label: 'Remote-head, cut & coded', base: 189 }, { id: 'spare', label: 'Spare remote-head', base: 159 }],
    note: 'Blade cut by code or decode; transponder coded on site.',
  },
  flip: {
    id: 'flip', label: 'Flip / switchblade key', fulfillment: 'aftermarket',
    types: [{ id: 'shell', label: 'Shell only', base: 29 }, { id: 'flip', label: 'Flip key, cut & coded', base: 169 }, { id: 'spare', label: 'Spare flip key', base: 139 }],
    note: 'Folding blade; coded on site. Popular on VW/Audi group and many others.',
  },
  bmw: {
    id: 'bmw', label: 'Display / comfort key', fulfillment: 'dealer-coordinated',
    types: [{ id: 'shell', label: 'Shell only', base: 59 }, { id: 'smart', label: 'Comfort key, coded', base: 349 }],
    note: 'Newer platforms (FEM/BDC) are often bench or dealer-coordinated. We confirm before you pay.',
  },
  mercedes: {
    id: 'mercedes', label: 'Chrome smart key', fulfillment: 'dealer-coordinated',
    types: [{ id: 'shell', label: 'Shell only', base: 59 }, { id: 'smart', label: 'Smart key (FBS3), coded', base: 379 }],
    note: 'FBS3 handled with specialist tools; FBS4 (≈2015+) is dealer-only and referred out.',
  },
  porsche: {
    id: 'porsche', label: 'Car-silhouette key', fulfillment: 'dealer-coordinated',
    types: [{ id: 'shell', label: 'Shell only', base: 79 }, { id: 'smart', label: 'Smart key, coded', base: 449 }],
    note: 'By model and year; some need online sessions. We confirm feasibility first.',
  },
  supercar: {
    id: 'supercar', label: 'Supercar smart key', fulfillment: 'oem',
    types: [{ id: 'shell', label: 'Custom shell / cover', base: 149 }, { id: 'coordinate', label: 'OEM key, coordinated', base: 0 }],
    note: 'Ferrari, Lamborghini, McLaren and similar: the working key is OEM. We design and source the shell/cover and coordinate OEM coding; price quoted per car.',
  },
  luxury: {
    id: 'luxury', label: 'Luxury smart key', fulfillment: 'dealer-coordinated',
    types: [{ id: 'shell', label: 'Shell only', base: 69 }, { id: 'smart', label: 'Smart key, coded', base: 329 }],
    note: 'Bentley, Rolls-Royce, Aston, Maserati, Jaguar, Land Rover, Lexus: feasibility confirmed per VIN before you pay.',
  },
}
