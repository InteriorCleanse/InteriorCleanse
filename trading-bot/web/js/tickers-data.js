/**
 * TICKER KNOWLEDGE — reference facts about SPY, ES, NVDA, TSLA and AAPL, plus
 * the date arithmetic their calendars follow. Pure: no page, no network.
 *
 * What this file is, and is not:
 * - REFERENCE, not market data. It holds contract specifications and the
 *   usual SHAPE of each calendar ("NVDA usually reports late in Feb, May,
 *   Aug and Nov"). It holds no prices, no forecasts and no exact future
 *   report dates, because those are not known here. Every page that shows it
 *   says to confirm dates with the company or the exchange.
 * - Dates that follow a published RULE (third Friday, ES quarterly months,
 *   the roll eight days before expiry) are computed, not stored.
 * - Nothing here trades. Mr. Cash does not trade these instruments.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const months = (list) => list.map((m) => MONTH[m - 1]).join(', ')

/** As of this review; schedules change, so the page prints it. */
export const REVIEWED = '2026-09'

export const TICKERS = {
  SPY: {
    symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'ETF', watched: true,
    what: 'An exchange-traded fund that holds the 500 stocks of the S&P 500. Its price is roughly the index divided by 10.',
    options: { multiplier: 100, exercise: 'american', settlement: '100 shares of SPY', expiries: 'Every weekday (Monday to Friday), plus monthly and quarterly series', strikes: '$1 apart near the money' },
    session: 'Regular session 9:30–16:00 ET. The ETF also trades before and after hours, with thinner books.',
    earningsMonths: [], earningsText: 'None: it is a fund. The biggest holdings report on their own schedules, and those reports move it.',
    dividendMonths: [3, 6, 9, 12], dividendText: 'Quarterly. The ex-dividend date is usually the third Friday of March, June, September and December, the same day as quarterly options expiry.',
    drivers: [
      'Fed decisions: eight scheduled meetings a year, statement at 2:00 pm ET.',
      'CPI (mid-month) and the jobs report (usually the first Friday), both at 8:30 am ET, before the open.',
      'Earnings from its largest weights, which include NVDA and AAPL.',
      'Monthly options expiry (third Friday) and quarterly "quad witching" in March, June, September and December.',
    ],
    spreadNotes: [
      'Same-day (0DTE) options move very fast: a few dollars in SPY can take a spread from full profit to full loss within the hour.',
      'An in-the-money short call is likely to be assigned the day before ex-dividend, because the holder wants the dividend.',
      'SPX options on the index itself are European-style and cash-settled, so they have no early assignment, and each is about 10× the size of a SPY contract.',
    ],
  },
  ES: {
    symbol: 'ES', name: 'E-mini S&P 500 futures (CME)', kind: 'Futures', watched: false,
    what: 'A futures contract on the S&P 500 index. One contract is $50 × the index; a one-point move is $50. The Micro E-mini (MES) is one tenth: $5 × the index.',
    contract: { multiplier: 50, tick: 0.25, tickValue: 12.5, microMultiplier: 5, months: 'March (H), June (M), September (U), December (Z)', settlement: 'Cash, to the Special Opening Quotation of the S&P 500 on the third Friday of the contract month' },
    options: { multiplier: 50, exercise: 'check', settlement: 'an ES futures position', expiries: 'Every weekday, end-of-month and quarterly', strikes: 'Commonly 5 index points apart' },
    exerciseText: 'The standard quarterly options are American-style; the weekday, weekly and end-of-month series are European-style. Check the series you trade.',
    session: 'Nearly around the clock: Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None: it is an index future. The same macro releases and big-company reports that move SPY move ES.',
    dividendMonths: [], dividendText: 'None paid. Expected dividends and interest are already built into the futures price (the "basis"), which is why ES does not sit at exactly 10× SPY.',
    drivers: [
      'Everything that moves SPY, plus the overnight session: Asia and Europe trade while New York sleeps.',
      'US data at 8:30 am ET lands an hour before stocks open, so ES often makes the first move.',
      'The roll: about eight days before expiry, volume moves to the next quarter\'s contract.',
    ],
    spreadNotes: [
      'Each option point is $50, half the $100 of a stock option, so the same dollar risk is twice the strike width in points.',
      'Exercise or assignment gives you a futures position, which carries margin and moves $50 a point. Close spreads before expiry if a leg is near the money.',
      'In the US, futures and futures options usually get 60/40 tax treatment (Section 1256). Ask a tax adviser.',
    ],
  },
  NVDA: {
    symbol: 'NVDA', name: 'NVIDIA Corporation', kind: 'Stock', watched: true,
    what: 'The chip designer behind most AI data-center accelerators. It is among the largest weights in the S&P 500 and the Nasdaq-100, so its moves show up in SPY and ES.',
    options: { multiplier: 100, exercise: 'american', settlement: '100 shares', expiries: 'Weekly (Fridays) and monthly (third Friday)', strikes: 'Varies with price; often $1–$5 apart' },
    session: 'Nasdaq regular session 9:30–16:00 ET, with pre- and after-hours trading.',
    earningsMonths: [2, 5, 8, 11], earningsText: `Its fiscal year ends in late January. It usually reports late in ${months([2, 5, 8, 11])}, after the close.`,
    dividendMonths: [], dividendText: 'A token dividend ($0.01 a share a quarter since the June 2024 10-for-1 split). It is too small to drive early assignment.',
    history: '4-for-1 (July 2021), 10-for-1 (June 2024). Old charts that are not split-adjusted look nothing like today\'s prices.',
    drivers: [
      'Data-center revenue and its guidance for the next quarter.',
      'Capital-spending plans from the big cloud companies (Microsoft, Alphabet, Amazon, Meta), announced in their own earnings.',
      'Export rules on advanced chips, especially to China.',
      'Supply from TSMC, and moves in other chip stocks (AMD, Broadcom).',
      'Its GTC developer conference, usually in March.',
    ],
    spreadNotes: [
      'Implied volatility is usually well above SPY\'s, rises into earnings and falls sharply after ("IV crush"). A spread bought the day before earnings pays for that.',
      'Earnings moves are often larger than a normal week\'s range. A defined-risk spread caps the loss, but the price can gap straight through both strikes overnight.',
    ],
  },
  TSLA: {
    symbol: 'TSLA', name: 'Tesla, Inc.', kind: 'Stock', watched: true,
    what: 'An electric-vehicle, energy-storage and autonomy company. It is one of the most actively traded stocks and single-stock options in the US, and a member of the S&P 500 since December 2020.',
    options: { multiplier: 100, exercise: 'american', settlement: '100 shares', expiries: 'Weekly (Fridays) and monthly (third Friday)', strikes: 'Varies with price; often $2.50–$5 apart' },
    session: 'Nasdaq regular session 9:30–16:00 ET, with pre- and after-hours trading.',
    earningsMonths: [1, 4, 7, 10], earningsText: `Its fiscal year is the calendar year. It usually reports late in ${months([1, 4, 7, 10])}, after the close, and publishes quarterly production and delivery numbers in the first days of the same months.`,
    dividendMonths: [], dividendText: 'None.',
    history: '5-for-1 (August 2020), 3-for-1 (August 2022).',
    drivers: [
      'Quarterly deliveries (early Jan, Apr, Jul, Oct) and automotive margins.',
      'Statements and posts from its CEO, which can move it outside any schedule.',
      'Autonomy and robotaxi news, and energy-storage growth.',
      'EV competition, tariffs and tax credits, and interest rates (car loans).',
    ],
    spreadNotes: [
      'Implied volatility is among the highest of the large-cap stocks. Credit spreads collect more premium here because the moves are larger, not because the trade is safer.',
      'Big overnight gaps on news are common, so a spread can go from full profit to full loss between two closes.',
    ],
  },
  AAPL: {
    symbol: 'AAPL', name: 'Apple Inc.', kind: 'Stock', watched: true,
    what: 'The maker of the iPhone, Mac and a large services business. It is among the largest weights in the S&P 500 and the Nasdaq-100.',
    options: { multiplier: 100, exercise: 'american', settlement: '100 shares', expiries: 'Weekly (Fridays) and monthly (third Friday)', strikes: 'Often $2.50–$5 apart' },
    session: 'Nasdaq regular session 9:30–16:00 ET, with pre- and after-hours trading.',
    earningsMonths: [1, 4, 5, 7, 8, 10, 11], earningsText: 'Its fiscal year ends in late September. It usually reports at the end of January, April or early May, July or early August, and October or early November, after the close.',
    dividendMonths: [2, 5, 8, 11], dividendText: 'Quarterly. The ex-dividend date usually falls in February, May, August and November.',
    history: '7-for-1 (June 2014), 4-for-1 (August 2020).',
    drivers: [
      'The iPhone cycle, with new models usually shown in September.',
      'Services revenue (App Store, subscriptions) and its margins.',
      'China: demand there, and the supply chain that runs through it; tariffs.',
      'Buybacks and the dividend; the WWDC developer conference in June.',
      'Regulation and antitrust cases about the App Store and search deals.',
    ],
    spreadNotes: [
      'Implied volatility is usually lower than NVDA\'s or TSLA\'s, so credit spreads collect less and debit spreads cost less for the same width.',
      'An in-the-money short call can be assigned just before the ex-dividend date.',
    ],
  },
}

export const ORDER = ['SPY', 'ES', 'NVDA', 'TSLA', 'AAPL']

/** Words this file and the page must never use about a trade. */
export const NEVER_SAY = /\b(profitable|proven|guaranteed?|superior|best)\b|edge established|expected return/i

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d))
const iso = (d) => d.toISOString().slice(0, 10)

/** The third Friday of a month: monthly options expiry, and ES final settlement. */
export function thirdFriday(year, month) {
  const first = utc(year, month, 1).getUTCDay() // 0 = Sunday
  const firstFriday = 1 + ((5 - first + 7) % 7)
  return utc(year, month, firstFriday + 14)
}

const CODE = { 3: 'H', 6: 'M', 9: 'U', 12: 'Z' }

/**
 * The ES contract calendar from a date: the front quarterly contract, its
 * last trading day (third Friday), the usual roll date (eight days earlier,
 * a Thursday), and the next contract. After the roll date most volume has
 * already moved to the next contract, and `rolled` says so.
 */
export function esCalendar(now = new Date()) {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const quarters = []
  for (let y = today.getUTCFullYear(); quarters.length < 3; y++) {
    for (const m of [3, 6, 9, 12]) {
      const expiry = thirdFriday(y, m)
      if (expiry >= today && quarters.length < 3) quarters.push({ code: `ES${CODE[m]}${String(y).slice(-1)}`, month: m, year: y, expiry })
    }
  }
  const [front, next] = quarters
  const roll = new Date(front.expiry.getTime() - 8 * 86_400_000)
  return {
    front: { code: front.code, expiry: iso(front.expiry), roll: iso(roll) },
    next: { code: next.code, expiry: iso(next.expiry) },
    rolled: today > roll,
    daysToExpiry: Math.round((front.expiry - today) / 86_400_000),
  }
}

/** The next monthly options expiry (third Friday) on or after a date, and whether it is a quarterly "quad witching" one. */
export function nextMonthlyExpiry(now = new Date()) {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  let y = today.getUTCFullYear(), m = today.getUTCMonth() + 1
  let d = thirdFriday(y, m)
  if (d < today) { m += 1; if (m > 12) { m = 1; y += 1 } d = thirdFriday(y, m) }
  return { date: iso(d), quarterly: [3, 6, 9, 12].includes(m) }
}

/**
 * ES and SPY side by side. SPY tracks the S&P 500 at roughly one tenth of the
 * index, so one ES contract ($50 × index) is about 500 SPY shares, or five
 * 100-share option contracts. A rule of thumb: dividends, fees and the
 * futures basis all move the true ratio.
 */
export function esSpy({ esContracts = 1, esPoints = 1 } = {}) {
  const n = Number.isFinite(esContracts) ? esContracts : 0
  const pts = Number.isFinite(esPoints) ? esPoints : 0
  return {
    spyShares: n * 500,
    spyOptionContracts: n * 5,
    esDollars: n * pts * 50,
    spyMoveDollars: Math.round(pts * 10) / 100,
    approximate: true,
  }
}

const DAY = 86_400_000
const monthsBetween = (from, to) => {
  const out = new Set()
  let y = from.getUTCFullYear(), m = from.getUTCMonth() + 1
  const endKey = to.getUTCFullYear() * 12 + to.getUTCMonth()
  while (y * 12 + (m - 1) <= endKey) { out.add(m); m += 1; if (m > 12) { m = 1; y += 1 } if (out.size >= 12) break }
  return out
}

/**
 * What this underlying adds to a spread's warnings, from reference facts and
 * the dates you typed. It knows the usual MONTHS of earnings and dividends,
 * not the exact dates, and says so.
 */
export function underlyingNotes(symbol, { expiry = null, now = new Date(), shortCall = false } = {}) {
  const t = TICKERS[String(symbol || '').toUpperCase()]
  if (!t) return { known: false, exercise: 'american', multiplier: null, dte: null, notes: [] }
  const notes = []
  let dte = null
  const exp = expiry ? new Date(expiry + 'T00:00:00Z') : null
  if (exp && !Number.isNaN(exp.getTime())) {
    const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
    dte = Math.round((exp - today) / DAY)
    if (dte < 0) notes.push('That expiry date has already passed.')
    else {
      if (dte <= 1) notes.push(`${dte === 0 ? 'Expires today' : 'Expires tomorrow'}: near expiry a small move in ${t.symbol} swings the spread from its best case to its worst very quickly.`)
      const span = monthsBetween(today, exp)
      const er = t.earningsMonths.filter((m) => span.has(m))
      if (er.length) notes.push(`Between now and expiry are months when ${t.symbol} usually reports earnings (${months([...new Set(er)])}). Check the exact date. A report before expiry can gap the price through both strikes; the most you can lose is still the figure above.`)
      const dv = t.dividendMonths.filter((m) => span.has(m))
      if (shortCall && dv.length && t.options.exercise === 'american') notes.push(`${t.symbol} usually goes ex-dividend in ${months([...new Set(dv)])}. An in-the-money short call is likely to be assigned the day before.`)
    }
  }
  if (t.symbol === 'ES') notes.push(`Options on ES futures: $50 a point, and exercise delivers an ES futures position. ${t.exerciseText}`)
  return { known: true, symbol: t.symbol, exercise: t.options.exercise, multiplier: t.options.multiplier, dte, notes }
}
