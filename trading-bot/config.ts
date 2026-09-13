/**
 * ============================================================
 *  YOUR SETTINGS  —  this is the only file you need to edit.
 * ============================================================
 *
 * Change a number, save the file, run the bot again. That's it.
 * Nothing here can place a real trade. There is no live-trading
 * switch anywhere in this project.
 *
 * Times below are in NEW YORK time (ET), because that is how the
 * ICT session model is defined. The bot converts to your local
 * time whenever it prints something.
 */

export const config = {
  // ---------- WHAT TO WATCH ----------

  /** The market. BTCUSDT means "Bitcoin priced in US dollars". */
  symbol: 'BTCUSDT',

  /**
   * Candle size. The session model works best on '5m' or '1m'.
   * Options: '1m' '3m' '5m' '15m' '30m' '1h' '4h' '1d'
   */
  interval: '5m',

  /**
   * Which brain to use.
   *   'ict'       — session ranges, liquidity sweeps, inversion FVGs (the main one)
   *   'crossover' — the simple 9/21 moving-average teaching strategy
   */
  strategy: 'ict' as 'ict' | 'crossover',

  // ---------- YOUR (PRETEND) MONEY ----------

  /** Pretend balance. Not connected to anything. */
  accountSizeUsd: 25,

  /**
   * How much of the account one losing trade is allowed to cost.
   * 1 means 1% — on a $25 account that is 25 cents per loss.
   * Professionals rarely go above 1–2%. The bot sizes every ICT
   * trade so that hitting the stop loses exactly this much.
   */
  riskPerTradePercent: 1,

  /** Never let one position be worth more than this many dollars. */
  maxPositionValueUsd: 25,

  /**
   * Trading fees, percent per side. 0.1 is typical for crypto.
   * Every result the bot shows you already has fees taken out.
   */
  feePercent: 0.1,

  // ---------- THE ICT SESSION MODEL ----------

  ict: {
    /** The clock the session model runs on. Leave this alone. */
    timezone: 'America/New_York',

    /**
     * The "trading day" rolls over at this hour ET (18 = 6pm), so the
     * Asian session that starts in the evening belongs to the NEXT
     * day's plan — the day it sets up. This is how ICT counts days.
     */
    dayStartHour: 18,

    /**
     * Session windows, in ET, 24-hour clock. Each one gets a High and
     * a Low marked on the chart and watched for sweeps.
     */
    sessions: {
      asia:    { start: '20:00', end: '00:00', label: 'Asia' },
      london:  { start: '02:00', end: '05:00', label: 'London' },
      newYork: { start: '08:30', end: '11:00', label: 'New York AM' },
      nyPM:    { start: '13:30', end: '16:00', label: 'New York PM' },
    },

    /**
     * The bot is only allowed to ENTER during these sessions. These
     * are the "killzones" — the windows where the big players move
     * price. Outside them it watches and reports, but never trades.
     */
    killzones: ['london', 'newYork'] as Array<'asia' | 'london' | 'newYork' | 'nyPM'>,

    /** Sit out Saturday and Sunday — thin liquidity, no institutions. */
    skipWeekends: true,

    /**
     * The setup, step by step. The bot needs ALL of these before it
     * takes a trade, and it tells you which ones are missing.
     */

    /** A sweep must poke at least this far past the level, in ATRs. 0 = any wick counts. */
    sweepMinDepthAtr: 0.05,

    /** After a sweep, the reversal candle's BODY must be at least this many ATRs. That's "displacement". */
    displacementBodyAtr: 1.0,

    /** A fair value gap smaller than this (in ATRs) is noise and is ignored. */
    fvgMinSizeAtr: 0.15,

    /**
     * Wait for an INVERSION fair value gap before entering.
     *   true  — the gap must first be broken through, then come back and hold
     *           (the inversion). This is the entry you asked for.
     *   false — a plain retest of the displacement gap is enough. More trades, lower quality.
     */
    requireInversion: true,

    /** How many candles after a sweep the bot keeps looking for the rest of the setup. 24 × 5m = 2 hours. */
    setupWindowCandles: 24,

    /** Forget a fair value gap this many candles after it formed. 288 × 5m = one day. */
    fvgMaxAgeCandles: 288,

    /** Stop loss sits this many ATRs beyond the sweep wick, so a re-poke doesn't take you out. */
    stopBufferAtr: 0.15,

    /**
     * Where to take profit.
     *   'liquidity' — aim for the opposite session high/low (the next pool of orders)
     *   'fixed'     — always aim for fixedRR times the risk
     */
    takeProfit: 'liquidity' as 'liquidity' | 'fixed',

    /** The reward-to-risk the bot insists on. 2 means "make $2 for every $1 risked". */
    minRR: 2,

    /** Used when takeProfit is 'fixed', or when no liquidity target gives enough RR. */
    fixedRR: 2,

    /** Give up on a trade that hasn't hit stop or target after this many candles. 96 × 5m = 8 hours. */
    maxHoldCandles: 96,

    /** Hard daily brakes. Both are your friend. */
    maxTradesPerDay: 2,
    dailyLossLimitR: 2,

    /** Skip a day whose Asia range is tiny — nothing to sweep, no story. In ATRs. */
    minAsiaRangeAtr: 0.8,

    /** Don't enter this many minutes before or after a high-impact news event. */
    newsBlackoutMinutes: 15,

    /** Indicator lengths. Leave these unless you know why you're changing them. */
    atrPeriod: 14,
    swingLookback: 3,
  },

  // ---------- THE SIMPLE STRATEGY (only used when strategy = 'crossover') ----------

  crossover: {
    fastMA: 9,
    slowMA: 21,
    quantity: 0.0002,
    maxPosition: 0.001,
    holdCandles: 12,
  },

  // ---------- THE LOOK-BACK TEST ----------

  replay: {
    /** How many days of history to test the ICT model on. More = slower but more honest. */
    lookbackDays: 30,

    /** Below this many trades the bot warns you the sample is too small to mean anything. */
    minSetupsForConfidence: 20,
  },

  // ---------- MEMORY ----------

  memory: {
    /** How many times the same kind of setup must LOSE before the bot refuses it. */
    skipAfterLosses: 3,

    /** ...and it must also win less often than this (0.4 = 40%). */
    skipIfWinRateBelow: 0.4,
  },

  // ---------- NEWS ----------

  news: {
    /** Which currencies' economic events matter to you. USD moves everything. */
    currencies: ['USD'],

    /** Only these impact levels make it onto the "stand aside" list. */
    blackoutImpacts: ['High'],

    /** Re-download news at most this often. Feeds don't like being hammered. */
    cacheMinutes: 10,
  },

  // ---------- THE OPTIONAL AI ASSISTANT ----------

  ai: {
    /**
     * Which Claude model answers your questions in `npm run talk`
     * and the dashboard's Ask tab. Needs ANTHROPIC_API_KEY in .env.
     *
     *   'claude-opus-5'     — the default. Excellent, and half the price.
     *   'claude-fable-5-1'  — Anthropic's most capable model. About 2× the cost.
     *
     * A typical question costs a fraction of a cent on either.
     * The bot prints the cost after every answer so you always know.
     */
    model: 'claude-opus-5',

    /** How hard the model thinks: 'low' | 'medium' | 'high'. Medium is plenty for Q&A. */
    effort: 'medium' as 'low' | 'medium' | 'high',

    /** Price per million tokens, used only to show you the cost. */
    prices: {
      'claude-opus-5':    { input: 5,  output: 25 },
      'claude-fable-5-1': { input: 10, output: 50 },
    } as Record<string, { input: number; output: number }>,
  },

  // ---------- THE APP ----------

  /** Which port the app opens on. Change only if 4173 is busy. */
  webPort: 4173,

  app: {
    /**
     * Let your phone open Mr. Cash over your home wifi.
     *   false — this computer only (safest, the default)
     *   true  — also reachable from other devices on the same network,
     *           protected by the PIN below
     */
    allowPhone: false,

    /** The PIN your phone must enter. Leave '' and Mr. Cash makes a fresh one every start and prints it. */
    pin: '',

    /** While the app is open, re-read the market this often (minutes) and raise alerts. 5 = every candle. */
    watchEveryMinutes: 5,

    /** Warn this many minutes before an entry window opens. */
    killzoneHeadsUpMinutes: 15,
  },

  // ---------- ORDER FLOW ----------

  orderflow: {
    /** Read the public order book and recent trades. Free, no key. */
    enabled: true,

    /** How many price levels of the order book to read on each side (max 5000). */
    depthLevels: 1000,

    /** Group the book into buckets this wide, as a percent of price. 0.1 = $100 buckets at $100,000. */
    bucketPercent: 0.1,

    /** A bucket holding at least this many times the typical bucket is a "wall". */
    wallMultiple: 5,

    /** A single trade bigger than this (in dollars) counts as a big print. */
    bigTradeUsd: 100_000,

    /** How many recent trades to read. Max 1000. */
    tradesLimit: 1000,
  },

  // ---------- TRADINGVIEW ----------

  tradingview: {
    /** The chart shown inside the app. Any TradingView symbol string. */
    widgetSymbol: 'BINANCE:BTCUSDT',

    /**
     * A secret your TradingView alerts must include, so nobody else can
     * poke the webhook. Leave '' and Mr. Cash makes one and prints it.
     */
    webhookSecret: '',
  },
}

/** Free, public, read-only order-flow endpoints — same hosts as the prices. */
export const flowSources = {
  orderBook: '/api/v3/depth',
  trades: '/api/v3/aggTrades',
}

/**
 * Where market data comes from. Free, public, read-only. No account,
 * no key, no sign-up. The bot tries them in order.
 */
export const dataSources = [
  'https://data-api.binance.vision/api/v3/klines',
  'https://api.binance.com/api/v3/klines',
  'https://api.binance.us/api/v3/klines',
]

/**
 * Where news comes from. All free, all public. If one is down the bot
 * says so and carries on with the others.
 */
export const newsSources = {
  /** This week's economic calendar, with impact ratings. */
  calendar: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',

  /** Headline feeds (RSS). */
  headlines: [
    { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'Google News',   url: 'https://news.google.com/rss/search?q=bitcoin+OR+crypto+OR+%22federal+reserve%22&hl=en-US&gl=US&ceid=US:en' },
  ],
}

/**
 * HARD SAFETY LOCK.
 * This is false and no code anywhere in this project sets it to true.
 * Every "order" is written to a text file and your screen — never to
 * an exchange.
 */
export const LIVE_TRADING_ENABLED = false
