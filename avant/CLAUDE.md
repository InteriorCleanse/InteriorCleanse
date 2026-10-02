# AVANT

Next.js 15 App Router app for a peer-to-peer car sharing marketplace. Light,
photo-led marketplace design: white and mist grey, asphalt ink `#1c1f24` for
text and primary actions, lime `#d4ff3a` only as a fill behind ink (the
all-in price tag, the active map pin, the brand mark). Archivo at two widths:
expanded for headlines, normal for reading. Standalone: its own package.json,
lockfile, PostCSS config and CI.

This is a real marketplace. The only photos of a car are the ones its host
took. Sample listings (`content/fleet.json`, hidden with
`NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0`) have no photos and are labelled
"Sample" everywhere.

Design skills in `.claude/skills`: `frontend-design` (Anthropic),
`web-design-guidelines`, `react-best-practices`, `composition-patterns`
(Vercel), `webapp-testing` (Anthropic). Never lime text on white; never a
single accented word in a headline.

## Rules

- **No fake photos.** Never add AI-generated, stock, rendered or
  "illustrative" pictures of cars, people or places. Listing photos come
  only from the host of that car; marketing pages use type, the product's
  own UI, or photography the owner supplies and has the rights to.
- **Sample data is always labelled** and never shown in production.
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
