# AVANT

Next.js 15 App Router app for a peer-to-peer car sharing marketplace. Light,
photo-led marketplace design: white and mist grey, asphalt ink `#1c1f24` for
text and primary actions, lime `#d4ff3a` only as a fill behind ink (the
all-in price tag, the active map pin, the brand mark). Archivo at two widths:
expanded for headlines, normal for reading. Standalone: its own package.json,
lockfile, PostCSS config and CI.

Every listing has its own generated photo (`car-<slug>` in
`content/asset-sources.json`). Pushing a change to that file runs the
"AVANT: land assets" workflow, which commits the images to `public/img`.

Design skills in `.claude/skills`: `frontend-design` (Anthropic),
`web-design-guidelines`, `react-best-practices`, `composition-patterns`
(Vercel), `webapp-testing` (Anthropic). Never lime text on white; never a
single accented word in a headline.

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
