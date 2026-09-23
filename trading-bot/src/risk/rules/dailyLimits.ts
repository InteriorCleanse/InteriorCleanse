/** The daily brakes: a cap on trades taken and on losses (in R) for the day. Both are the trader's friend. */
import { config } from '../../../config.ts'
import type { Rule } from './types.ts'

export const dailyTrades: Rule = (_c, s) => {
  const max = config.ict.maxTradesPerDay
  const ok = s.today.trades < max
  return { rule: 'Daily trades', passed: ok, detail: ok ? `${s.today.trades} of ${max} trades used today.` : `Already ${s.today.trades} trade(s) today; the limit is ${max}. Done for the day.` }
}

export const dailyLoss: Rule = (_c, s) => {
  const max = config.ict.dailyLossLimitR
  const ok = s.today.lossesR < max
  return { rule: 'Daily loss', passed: ok, detail: ok ? `Down ${s.today.lossesR.toFixed(1)}R of the ${max}R daily limit.` : `Down ${s.today.lossesR.toFixed(1)}R today — the ${max}R loss limit is hit. Tomorrow is a new day.` }
}
