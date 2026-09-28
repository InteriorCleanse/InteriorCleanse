# AVANT

Next.js 15 App Router app for a peer-to-peer car sharing marketplace. Dark,
editorial design (Instrument Serif + Inter Tight, acid lime `#d4ff3a` on
near-black). Standalone: its own package.json, lockfile and CI.

## Rules

- **Never trust the client's price.** `lib/checkout.ts` re-prices every
  booking; keep it that way.
- **Never store raw identity data.** Only the fields in `DriverRecordSchema`.
  Any new field needs a privacy reason in the PR.
- **Coverage numbers are placeholders** until an insurer signs them; leave
  `COVERAGE_TERMS_FINAL` false until then.
- **Follow the security baseline** in `.claude/skills/open-compute/SKILL.md`.
- Pure modules (`lib/pricing.ts`, `lib/eligibility.ts`, `lib/security/*`,
  `lib/verification/*`) import siblings with `.ts` extensions so Node's test
  runner can load them directly.

## Checks

```
npx tsc --noEmit
npx next lint
npm test
(cd services/vault && npm test)
npm audit --omit=dev --audit-level=high
npm run build
```
