/**
 * THE STOCK DESK'S UNIVERSE — tech and tech-adjacent leaders only.
 *
 * A curated list, not a screen of the whole market: every name here is an
 * established, liquid, large company in one of the owner's themes, so the DSC
 * rule's floor (no fresh IPOs, no caps under $500M, no names under 500k shares
 * a day) is met by who is allowed in, and a name outside this list is skipped
 * whatever it is doing. The volume floor is still checked against the bars.
 *
 * SECOND_ORDER is the sector-catalyst playbook's map: when a headline moves one
 * theme, these are the themes that supply, connect, power, fabricate or host it.
 */

export type Theme =
  | 'ai-chips' | 'semis' | 'memory' | 'foundry' | 'semi-equipment' | 'networking' | 'optics'
  | 'software' | 'cloud' | 'cybersecurity' | 'internet' | 'servers' | 'dc-power' | 'dc-operators'

export type Stock = { symbol: string; name: string; theme: Theme; aliases: string[] }

export const THEME_LABEL: Record<Theme, string> = {
  'ai-chips': 'AI chips', semis: 'Semiconductors', memory: 'Memory', foundry: 'Foundries',
  'semi-equipment': 'Chip equipment', networking: 'Networking', optics: 'Optics and interconnect',
  software: 'Software', cloud: 'Cloud', cybersecurity: 'Cybersecurity', internet: 'Large-cap internet',
  servers: 'AI-capex servers', 'dc-power': 'Data-center power and cooling', 'dc-operators': 'AI data-center operators',
}

/** The sector ETF each theme is measured against for relative strength. */
export const THEME_ETF: Record<Theme, string> = {
  'ai-chips': 'SMH', semis: 'SMH', memory: 'SMH', foundry: 'SMH', 'semi-equipment': 'SMH',
  networking: 'XLK', optics: 'XLK', software: 'IGV', cloud: 'IGV', cybersecurity: 'IGV',
  internet: 'QQQ', servers: 'XLK', 'dc-power': 'XLK', 'dc-operators': 'XLK',
}

const s = (symbol: string, name: string, theme: Theme, ...aliases: string[]): Stock => ({ symbol, name, theme, aliases: [name.toLowerCase(), ...aliases] })

export const UNIVERSE: Stock[] = [
  s('NVDA', 'Nvidia', 'ai-chips'), s('AMD', 'AMD', 'ai-chips', 'advanced micro devices'), s('AVGO', 'Broadcom', 'ai-chips'), s('MRVL', 'Marvell', 'ai-chips'),
  s('ARM', 'Arm', 'semis', 'arm holdings'), s('QCOM', 'Qualcomm', 'semis'), s('ALAB', 'Astera Labs', 'semis', 'astera'), s('CRDO', 'Credo', 'semis', 'credo technology'),
  s('MU', 'Micron', 'memory'), s('WDC', 'Western Digital', 'memory'), s('STX', 'Seagate', 'memory'),
  s('TSM', 'TSMC', 'foundry', 'taiwan semiconductor'), s('INTC', 'Intel', 'foundry'), s('GFS', 'GlobalFoundries', 'foundry'),
  s('ASML', 'ASML', 'semi-equipment'), s('AMAT', 'Applied Materials', 'semi-equipment'), s('LRCX', 'Lam Research', 'semi-equipment'), s('KLAC', 'KLA', 'semi-equipment'),
  s('ANET', 'Arista', 'networking', 'arista networks'), s('CSCO', 'Cisco', 'networking'), s('CIEN', 'Ciena', 'networking'),
  s('COHR', 'Coherent', 'optics'), s('LITE', 'Lumentum', 'optics'), s('FN', 'Fabrinet', 'optics'), s('AAOI', 'Applied Optoelectronics', 'optics'),
  s('MSFT', 'Microsoft', 'software'), s('ORCL', 'Oracle', 'software'), s('NOW', 'ServiceNow', 'software'), s('PLTR', 'Palantir', 'software'), s('CRM', 'Salesforce', 'software'),
  s('SNOW', 'Snowflake', 'cloud'), s('DDOG', 'Datadog', 'cloud'), s('MDB', 'MongoDB', 'cloud'), s('NET', 'Cloudflare', 'cloud'),
  s('CRWD', 'CrowdStrike', 'cybersecurity'), s('PANW', 'Palo Alto Networks', 'cybersecurity', 'palo alto'), s('ZS', 'Zscaler', 'cybersecurity'), s('FTNT', 'Fortinet', 'cybersecurity'),
  s('GOOGL', 'Alphabet', 'internet', 'google'), s('META', 'Meta', 'internet', 'facebook'), s('AMZN', 'Amazon', 'internet', 'aws'),
  s('DELL', 'Dell', 'servers'), s('SMCI', 'Super Micro', 'servers', 'supermicro'), s('HPE', 'Hewlett Packard Enterprise', 'servers'),
  s('VRT', 'Vertiv', 'dc-power'), s('ETN', 'Eaton', 'dc-power'), s('GEV', 'GE Vernova', 'dc-power', 'vernova'), s('CEG', 'Constellation Energy', 'dc-power', 'constellation'), s('VST', 'Vistra', 'dc-power'),
  s('CRWV', 'CoreWeave', 'dc-operators'), s('NBIS', 'Nebius', 'dc-operators'), s('EQIX', 'Equinix', 'dc-operators'), s('IREN', 'IREN', 'dc-operators', 'iris energy'),
]

/** Who supplies, connects, powers, fabricates or hosts each theme. */
export const SECOND_ORDER: Record<Theme, Theme[]> = {
  'ai-chips': ['networking', 'optics', 'foundry', 'memory', 'dc-power', 'servers'],
  semis: ['foundry', 'semi-equipment', 'memory'],
  memory: ['semi-equipment', 'foundry'],
  foundry: ['semi-equipment', 'memory'],
  'semi-equipment': ['foundry', 'memory'],
  networking: ['optics', 'semis'],
  optics: ['networking', 'semis'],
  software: ['cloud', 'cybersecurity'],
  cloud: ['dc-operators', 'servers', 'networking', 'dc-power'],
  cybersecurity: ['cloud', 'software'],
  internet: ['cloud', 'dc-operators', 'ai-chips', 'networking', 'dc-power'],
  servers: ['ai-chips', 'memory', 'networking', 'dc-power'],
  'dc-power': ['dc-operators', 'servers'],
  'dc-operators': ['dc-power', 'servers', 'networking', 'ai-chips'],
}

/** The market check before any buy. VIXY stands in for the VIX and IEF for rates (bond prices move opposite to yields). */
export const MARKET_CHECK = ['SPY', 'QQQ', 'XLK', 'SMH', 'IGV', 'VIXY', 'IEF'] as const

export const STOCK_OF: Record<string, Stock> = Object.fromEntries(UNIVERSE.map((x) => [x.symbol, x]))
export const ALL_SYMBOLS: string[] = [...new Set([...UNIVERSE.map((x) => x.symbol), ...MARKET_CHECK])]
