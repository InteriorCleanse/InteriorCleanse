/** The big red button. When it is on, nothing opens — paper included. This rule runs first. */
import type { Rule } from './types.ts'

export const killSwitch: Rule = (_c, s) => ({
  rule: 'Kill switch',
  passed: s.killSwitch.ok,
  detail: s.killSwitch.ok ? 'Off — entries are allowed.' : s.killSwitch.reason,
})
