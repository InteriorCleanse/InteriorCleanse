/**
 * Gavel — the settings a person may want to change, all in one place.
 *
 * Everything here has a plain-English note. Change a value, restart the app.
 * Secrets never live in this file: they come from .env (see .env.example).
 */

export const config = {
  /** The app listens here. 127.0.0.1 = this computer only; 0.0.0.0 = every device on the network (and the internet, if a port is open). */
  host: process.env.GAVEL_HOST || '127.0.0.1',
  webPort: 8790,

  /** Starter mode: the rules that keep a beginner out of trouble. Members can loosen them in Settings later. */
  starter: {
    /** Only clean titles. Salvage, rebuilt, flood, lemon and parts-only are hidden. */
    cleanTitleOnly: true,
    /** The most damage allowed: 'none' | 'minor'. */
    maxDamage: 'minor' as 'none' | 'minor' | 'moderate' | 'severe',
    /** Skip cars that do not run and drive, or where nobody says. */
    mustRunAndDrive: true,
    /** Ignore cars above this current bid / asking price, in dollars. */
    maxPriceUsd: 60_000,
    /** Ignore cars with more miles than this. */
    maxMileage: 120_000,
    /** Ignore cars older than this model year. */
    minYear: 2008,
  },

  /** What "a steal" means. A listing scores 100 when it is priced this far under its comparables. */
  scoring: {
    /** Discount to the estimate that earns full marks, as a fraction (0.35 = 35% under). */
    fullMarksDiscount: 0.35,
    /** Below this discount a car is not a deal at all. */
    noDealDiscount: 0.05,
    /** How many comparable listings the estimate needs before it is shown as a number at all. */
    minComps: 3,
    /**
     * Sold prices older than this many days are left out of estimates: the
     * market moves. Gavel's working choice, not a market statistic.
     */
    soldMaxAgeDays: 730,
  },

  /** The bid plan. Everything is a default the person can override on the page. */
  plan: {
    /** Margin you want left over after fees, transport and repairs, as a fraction of the resale price. */
    targetMargin: 0.15,
    /**
     * The default by goal. A flip needs a margin to sell at; a car kept or
     * rented out only needs to be bought under the market, so its "margin" is
     * a small discount to market value. Gavel's working choices; the member
     * can type their own on every plan.
     */
    targetMarginByGoal: { flip: 0.15, rental: 0.05, keep: 0.05 },
    /** A cushion for surprises found after the car arrives. */
    surpriseReserveUsd: 750,
    /**
     * For a supercar the cushion is this share of its value instead, when that
     * is more: one repair on these cars can cost more than the whole usual
     * cushion. Gavel's working choice; the member sees it on the plan.
     */
    supercarReservePct: 0.05,
    /** Typical transport cost per mile for an open carrier. Verify with a quote. */
    transportPerMileUsd: 0.9,
    /** Miles to assume when the listing has no location. */
    defaultDistanceMiles: 300,
  },

  ai: {
    /** The Anthropic model for the optional explainer. */
    model: 'claude-opus-5',
    effort: 'medium' as 'low' | 'medium' | 'high',
  },
}
