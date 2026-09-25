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
    symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'ETF', group: 'stocks', watched: true,
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
    symbol: 'ES', name: 'E-mini S&P 500 futures (CME)', kind: 'Futures', group: 'index', watched: false, proxy: 'SPY',
    what: 'A futures contract on the S&P 500 index. One contract is $50 × the index; a one-point move is $50. The Micro E-mini (MES) is one tenth: $5 × the index.',
    contract: { multiplier: 50, unit: 'index point', tick: 0.25, tickValue: 12.5, size: '$50 × the S&P 500', micro: 'Micro E-mini (MES): $5 × the index, $1.25 a tick', monthCodes: [3, 6, 9, 12], months: 'March (H), June (M), September (U), December (Z)', settlement: 'Cash, to the Special Opening Quotation of the S&P 500 on the third Friday of the contract month', lastTradeRule: 'third-friday', lastTradeText: 'The third Friday of the contract month.', physical: false },
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
    symbol: 'NVDA', name: 'NVIDIA Corporation', kind: 'Stock', group: 'stocks', watched: true,
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
    symbol: 'TSLA', name: 'Tesla, Inc.', kind: 'Stock', group: 'stocks', watched: true,
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
    symbol: 'AAPL', name: 'Apple Inc.', kind: 'Stock', group: 'stocks', watched: true,
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
  NQ: {
    symbol: 'NQ', name: 'E-mini Nasdaq-100 futures (CME)', kind: 'Futures', group: 'index', watched: false, proxy: 'QQQ',
    what: 'A futures contract on the Nasdaq-100: the largest non-financial Nasdaq companies. NVDA, AAPL and TSLA carry far more weight here than in the S&P 500, so NQ usually swings harder than ES.',
    contract: { multiplier: 20, unit: 'index point', tick: 0.25, tickValue: 5, size: '$20 × the Nasdaq-100', micro: 'Micro E-mini (MNQ): $2 × the index, $0.50 a tick', monthCodes: [3, 6, 9, 12], months: 'March (H), June (M), September (U), December (Z)', settlement: 'Cash, to the Special Opening Quotation of the Nasdaq-100 on the third Friday of the contract month', lastTradeRule: 'third-friday', lastTradeText: 'The third Friday of the contract month.', physical: false },
    options: { multiplier: 20, exercise: 'check', settlement: 'an NQ futures position', expiries: 'Every weekday, end-of-month and quarterly', strikes: 'Commonly 10–25 index points apart' },
    exerciseText: 'As with ES, the quarterly options are American-style and the weekday and end-of-month series European-style. Check the series you trade.',
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None: it is an index future. Earnings from its largest weights (NVDA, AAPL, Microsoft, Amazon and others) move it most.',
    dividendMonths: [], dividendText: 'None paid; expected dividends and interest are in the futures price.',
    drivers: [
      'Big-tech earnings, above all NVDA, AAPL, Microsoft, Amazon, Alphabet and Meta.',
      'Interest rates: growth stocks are sensitive to the 10-year yield (see ZN).',
      'The same macro calendar as ES: Fed, CPI, jobs.',
    ],
    spreadNotes: [
      'Each point is $20, and the Nasdaq-100 sits at several times the S&P 500\'s level, so NQ moves many more points than ES. Size the width of a spread in dollars, not points.',
      'Exercise or assignment delivers an NQ futures position. Close spreads before expiry if a leg is near the money.',
    ],
  },
  CL: {
    symbol: 'CL', name: 'WTI crude oil futures (NYMEX)', kind: 'Futures', group: 'commodities', watched: false, proxy: 'USO',
    what: 'The US benchmark for crude oil: West Texas Intermediate, delivered at Cushing, Oklahoma. One contract is 1,000 barrels.',
    contract: { multiplier: 1000, unit: 'dollar a barrel', tick: 0.01, tickValue: 10, size: '1,000 barrels', micro: 'Micro WTI (MCL): 100 barrels, $1 a tick', monthCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], months: 'Every month', settlement: 'Physical delivery of oil at Cushing, Oklahoma', lastTradeRule: 'cl', lastTradeText: 'Three business days before the 25th of the month BEFORE the contract month (four if the 25th is not a business day).', physical: true },
    options: { multiplier: 1000, exercise: 'check', settlement: 'a CL futures position', expiries: 'Monthly, plus weekly series', strikes: 'Commonly $0.50–$1 apart' },
    exerciseText: 'The standard monthly WTI options (LO) are American-style and exercise into CL futures; other WTI option contracts are European-style. Check the one you trade.',
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None. The scheduled movers are weekly inventory reports and OPEC+ meetings.',
    dividendMonths: [], dividendText: 'None.',
    history: 'In April 2020 the expiring May contract settled at minus $37.63 a barrel: holders who could not take delivery paid to get out. Physically delivered futures can do that.',
    drivers: [
      'The EIA weekly petroleum report, Wednesdays at 10:30 am ET (the private API estimate comes Tuesdays at 4:30 pm ET).',
      'OPEC+ production decisions and compliance.',
      'Geopolitics in producing regions and shipping lanes; sanctions.',
      'Global demand, especially China, and the US dollar.',
      'Hurricane season in the Gulf of Mexico (June to November); the Baker Hughes rig count, Fridays at 1:00 pm ET.',
    ],
    spreadNotes: [
      '$1 a barrel is $1,000 per contract. A $2 wide spread risks up to $2,000 per spread before premium.',
      'Never hold a CL future into delivery: most brokers close retail positions days before the last trading day, and the exercise of an option gives you a future that must then be closed.',
    ],
  },
  NG: {
    symbol: 'NG', name: 'Henry Hub natural gas futures (NYMEX)', kind: 'Futures', group: 'commodities', watched: false, proxy: 'UNG',
    what: 'The US benchmark for natural gas, delivered at the Henry Hub in Louisiana. One contract is 10,000 MMBtu. It is one of the most volatile major futures markets.',
    contract: { multiplier: 10000, unit: 'dollar per MMBtu', tick: 0.001, tickValue: 10, size: '10,000 MMBtu', micro: 'Smaller contracts exist; check what your broker offers', monthCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], months: 'Every month', settlement: 'Physical delivery at the Henry Hub, Louisiana', lastTradeRule: 'ng', lastTradeText: 'Three business days before the first day of the contract month.', physical: true },
    options: { multiplier: 10000, exercise: 'check', settlement: 'an NG futures position or cash, depending on the contract', expiries: 'Monthly, plus weekly series', strikes: 'Commonly $0.05 apart' },
    exerciseText: 'Natural gas has more than one options contract; some are American-style and exercise into futures, others are European-style and settle in cash. Check the one you trade.',
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None. The scheduled mover is the weekly storage report.',
    dividendMonths: [], dividendText: 'None.',
    drivers: [
      'Weather forecasts: heating demand in winter, air-conditioning power demand in summer.',
      'The EIA weekly storage report, Thursdays at 10:30 am ET, against what traders expected.',
      'LNG export flows, production, and pipeline or plant outages.',
      'Hurricanes in the Gulf of Mexico, and seasonality: winter contracts usually cost more than spring ones.',
    ],
    spreadNotes: [
      '$0.10 is $1,000 per contract, and NG can move far more than that in a day. A narrow spread in price terms can still be wide in dollars.',
      'Physically delivered: do not hold into delivery. The ETF stand-in (UNG) holds futures and rolls them, so over months it can drift far from the price of gas itself.',
    ],
  },
  GC: {
    symbol: 'GC', name: 'Gold futures (COMEX)', kind: 'Futures', group: 'commodities', watched: false, proxy: 'GLD',
    what: 'The main gold futures contract. One contract is 100 troy ounces.',
    contract: { multiplier: 100, unit: 'dollar an ounce', tick: 0.1, tickValue: 10, size: '100 troy ounces', micro: 'Micro Gold (MGC): 10 ounces, $1 a tick', monthCodes: [2, 4, 6, 8, 10, 12], months: 'Most active: February (G), April (J), June (M), August (Q), October (V), December (Z)', settlement: 'Physical delivery of gold at approved vaults', lastTradeRule: 'third-last-business', lastTradeText: 'The third-last business day of the contract month. First notice comes earlier, at the end of the month before.', physical: true },
    options: { multiplier: 100, exercise: 'american', settlement: 'a GC futures position', expiries: 'Monthly, plus weekly series', strikes: 'Commonly $5–$25 apart' },
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None.',
    dividendMonths: [], dividendText: 'None. Gold pays no income, which is why the interest you give up by holding it matters.',
    drivers: [
      'Real interest rates: when inflation-adjusted yields fall, gold usually gets support, and the other way round.',
      'The US dollar: gold is priced in dollars.',
      'Central-bank buying, and demand for safety in crises.',
      'Fed decisions, CPI and the jobs report.',
    ],
    spreadNotes: [
      '$1 an ounce is $100 per contract; a $20 move is $2,000.',
      'Close or roll before first notice (the end of the month before the contract month). Most brokers will not let a retail account take delivery.',
    ],
  },
  SI: {
    symbol: 'SI', name: 'Silver futures (COMEX)', kind: 'Futures', group: 'commodities', watched: false, proxy: 'SLV',
    what: 'The main silver futures contract. One contract is 5,000 troy ounces. Silver follows gold but swings harder, and it has more industrial demand (electronics, solar panels).',
    contract: { multiplier: 5000, unit: 'dollar an ounce', tick: 0.005, tickValue: 25, size: '5,000 troy ounces', micro: 'Micro Silver (SIL): 1,000 ounces, $5 a tick', monthCodes: [3, 5, 7, 9, 12], months: 'Most active: March (H), May (K), July (N), September (U), December (Z)', settlement: 'Physical delivery of silver at approved vaults', lastTradeRule: 'third-last-business', lastTradeText: 'The third-last business day of the contract month. First notice comes earlier, at the end of the month before.', physical: true },
    options: { multiplier: 5000, exercise: 'american', settlement: 'an SI futures position', expiries: 'Monthly, plus weekly series', strikes: 'Commonly $0.25–$0.50 apart' },
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None.',
    dividendMonths: [], dividendText: 'None.',
    drivers: [
      'Gold, and the same real-rate and dollar forces behind it.',
      'Industrial demand, especially solar panels and electronics.',
      'The gold-to-silver ratio, which traders watch for stretches.',
    ],
    spreadNotes: [
      '$0.10 an ounce is $500 per contract; a $1 move is $5,000. The micro contract is often the sensible size to learn on.',
      'Close or roll before first notice, as with gold.',
    ],
  },
  ZN: {
    symbol: 'ZN', name: '10-Year US Treasury Note futures (CBOT)', kind: 'Futures', group: 'rates', watched: false, proxy: 'IEF',
    what: 'A futures contract on US Treasury notes with about 6½–10 years left, $100,000 face value. The price moves opposite to yields: when the 10-year yield rises, ZN falls. Rates feed into every other market here.',
    contract: { multiplier: 1000, unit: 'point', tick: 1 / 64, tickValue: 15.625, size: '$100,000 face value; one point is $1,000', micro: 'A micro 10-year yield contract exists (quoted in yield, not price); check your broker', monthCodes: [3, 6, 9, 12], months: 'March (H), June (M), September (U), December (Z)', settlement: 'Physical delivery of eligible Treasury notes', lastTradeRule: 'zn', lastTradeText: 'The seventh business day before the last business day of the contract month. First notice comes earlier, at the end of the month before.', physical: true },
    options: { multiplier: 1000, exercise: 'american', settlement: 'a ZN futures position', expiries: 'Monthly and quarterly, plus weekly series', strikes: 'Commonly ½ point apart' },
    session: 'Sunday 6:00 pm ET to Friday 5:00 pm ET, with a daily one-hour break from 5:00 to 6:00 pm ET.',
    earningsMonths: [], earningsText: 'None.',
    dividendMonths: [], dividendText: 'None paid; the notes\' interest is already in the futures price.',
    drivers: [
      'Fed decisions and the path of rates the market expects.',
      'CPI and the jobs report, both at 8:30 am ET.',
      'Treasury auctions, including the monthly 10-year note auction.',
      'Flight to safety: in a stock-market scare, money often moves into Treasuries.',
    ],
    spreadNotes: [
      'Prices are quoted in points and 32nds (options in 64ths). Type them here as decimals: 110-16 is 110.5, and an option at 0-32 is 0.50.',
      'One full point is $1,000 per contract. Close or roll before first notice.',
    ],
  },
}

export const ORDER = ['SPY', 'NVDA', 'TSLA', 'AAPL', 'ES', 'NQ', 'CL', 'NG', 'GC', 'SI', 'ZN']

/** How the chips are grouped on the page. */
export const GROUPS = [
  { id: 'stocks', label: 'Stocks & ETF', symbols: ['SPY', 'NVDA', 'TSLA', 'AAPL'] },
  { id: 'index', label: 'Index futures', symbols: ['ES', 'NQ'] },
  { id: 'commodities', label: 'Commodities', symbols: ['CL', 'NG', 'GC', 'SI'] },
  { id: 'rates', label: 'Rates', symbols: ['ZN'] },
]

/** What the ETF stand-ins are, so a proxy price is never read as the future's price. */
export const PROXY_NOTE = {
  SPY: 'an ETF on the S&P 500, about the index ÷ 10',
  QQQ: 'an ETF on the Nasdaq-100',
  USO: 'a fund that holds oil futures and rolls them monthly, so over months it drifts away from the price of oil',
  UNG: 'a fund that holds natural-gas futures and rolls them monthly, so over months it can drift far from the price of gas',
  GLD: 'a fund that holds physical gold; each share is a fraction of an ounce',
  SLV: 'a fund that holds physical silver; each share is a little under an ounce, shrinking slowly with fees',
  IEF: 'a fund of 7–10-year Treasury notes, close to but not the same as what ZN delivers',
}

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

const CODE = { 1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M', 7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z' }
const DAY_MS = 86_400_000
const isBiz = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6
/** Step back n weekdays. Exchange holidays are NOT known here; the page says so. */
function backBiz(d, n) { let x = new Date(d); while (n > 0) { x = new Date(x.getTime() - DAY_MS); if (isBiz(x)) n-- } return x }
function lastBiz(y, m) { let x = utc(y, m + 1, 1); do { x = new Date(x.getTime() - DAY_MS) } while (!isBiz(x)); return x }

/** The last trading day of a futures contract month, by the exchange's published rule (weekdays only). */
export function lastTradeDay(rule, year, month) {
  switch (rule) {
    case 'third-friday': return thirdFriday(year, month)
    // CL: 3 business days before the 25th of the prior month; 4 if the 25th is not a business day.
    case 'cl': { const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1; const d25 = utc(py, pm, 25); return backBiz(d25, isBiz(d25) ? 3 : 4) }
    // NG: 3 business days before the first calendar day of the contract month.
    case 'ng': return backBiz(utc(year, month, 1), 3)
    // GC, SI: the third-last business day of the contract month.
    case 'third-last-business': return backBiz(lastBiz(year, month), 2)
    // ZN: the seventh business day before the last business day of the contract month.
    case 'zn': return backBiz(lastBiz(year, month), 7)
    default: throw new Error('unknown rule ' + rule)
  }
}

/**
 * A futures calendar from a date: the front contract (the first whose last
 * trading day has not passed), its last day, the next contract and, where it
 * applies, the roll or first-notice date to be out by.
 */
export function futuresCalendar(symbol, now = new Date()) {
  const t = TICKERS[symbol]
  if (!t || !t.contract) return null
  const c = t.contract
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const list = []
  for (let i = 0; list.length < 2 && i < 30; i++) {
    const y = today.getUTCFullYear() + Math.floor((today.getUTCMonth() + i) / 12), m = ((today.getUTCMonth() + i) % 12) + 1
    if (!c.monthCodes.includes(m)) continue
    const last = lastTradeDay(c.lastTradeRule, y, m)
    if (last >= today) list.push({ code: `${symbol}${CODE[m]}${String(y).slice(-1)}`, year: y, month: m, last })
  }
  const [front, next] = list
  let outBy = null, outByText = null
  if (c.lastTradeRule === 'third-friday') { outBy = new Date(front.last.getTime() - 8 * DAY_MS); outByText = 'Usual roll (volume moves to the next contract)' }
  else if (c.lastTradeRule === 'third-last-business' || c.lastTradeRule === 'zn') { outBy = lastBiz(front.month === 1 ? front.year - 1 : front.year, front.month === 1 ? 12 : front.month - 1); outByText = 'First notice day (be out before it)' }
  return {
    front: { code: front.code, last: iso(front.last) },
    next: { code: next.code, last: iso(next.last) },
    outBy: outBy ? iso(outBy) : null, outByText,
    passedOutBy: outBy ? today > outBy : false,
    daysToLast: Math.round((front.last - today) / DAY_MS),
    physical: c.physical,
    // Where traders actually are: past the roll or first notice, it is the next contract.
    active: outBy && today > outBy ? next.code : front.code,
  }
}

/** ES in the shape the page first used: front contract, expiry, roll, next. */
export function esCalendar(now = new Date()) {
  const f = futuresCalendar('ES', now)
  return {
    front: { code: f.front.code, expiry: f.front.last, roll: f.outBy },
    next: { code: f.next.code, expiry: f.next.last },
    rolled: f.passedOutBy,
    daysToExpiry: f.daysToLast,
  }
}

/** What a price move is worth on a futures contract: dollars and ticks. */
export function moveValue(symbol, { contracts = 1, move = 0 } = {}) {
  const t = TICKERS[symbol]
  if (!t || !t.contract) return null
  const n = Number.isFinite(contracts) ? contracts : 0, mv = Number.isFinite(move) ? move : 0
  return { dollars: Math.round(n * mv * t.contract.multiplier * 100) / 100, ticks: Math.round((mv / t.contract.tick) * 100) / 100, perTick: t.contract.tickValue }
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
  if (t.contract) {
    const c = t.contract
    notes.push(`Options on ${t.symbol} futures: $${c.multiplier.toLocaleString('en-US')} per 1.00 move (${c.unit}), and exercise delivers ${t.options.settlement}.${t.exerciseText ? ' ' + t.exerciseText : ''}`)
    if (c.physical) notes.push(`${t.symbol} futures are physically delivered. Close the spread, and any future it turns into, well before the last trading day; most brokers force-close retail positions before delivery.`)
  }
  return { known: true, symbol: t.symbol, exercise: t.options.exercise, multiplier: t.options.multiplier, dte, notes }
}
