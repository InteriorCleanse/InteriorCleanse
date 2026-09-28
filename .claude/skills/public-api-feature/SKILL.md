---
name: public-api-feature
description: Turns one public data API (weather, food, news, crypto, anything in github.com/public-apis/public-apis) into one small, tested feature. Verifies the provider's docs, pricing and terms first, keeps keys server-side, and tests the failure paths before calling anything done. Use when adding live third-party data to an app.
---

# Public API → one working feature

A repeatable workflow: find a source, verify its rules, build one feature,
test what happens when the source fails. Adapted from the owner's "PUB"
guide (Public APIs + Claude Code).

## 1. Pick one result, then one provider

Write the smallest result a user should get ("show the current temperature
for a saved city", not "a travel platform"). Choose the data that result
needs, then a provider. The Public APIs directory
(https://github.com/public-apis/public-apis) lists each entry's auth, HTTPS
and CORS; nothing needs cloning. **An entry is a lead, not a licence**: the
provider's own docs, pricing and terms decide what may be built.

Keep payments, accounts and dashboards out of the first version unless the
feature depends on them.

## 2. Check the provider before writing code

Read the official sources (docs, pricing, usage terms) and summarise, with
the URL for each fact:

- endpoint, required parameters, response fields
- authentication: none, key or OAuth
- HTTPS endpoint
- CORS: can a browser call it, or does it need a server route?
- request limits, caching rules, attribution, data freshness
- commercial-use terms (free tiers often exclude them)

If a page cannot be fetched or a rule is unclear, **say so and ask the user
for the excerpt**. Never guess an endpoint or a permission. Then inspect
the project and propose the smallest integration **before** changing files.

## 3. Build the smallest version

- Use the project's existing stack and conventions.
- Show only the fields the feature needs. Carry units and the provider's
  timestamp (with its timezone) through to the screen.
- Loading, empty and error states. Validate the response shape before
  reading nested fields. Handle non-2xx and a request timeout; bounded
  retries only where they make sense.
- Do not request on every render. Cache within the provider's documented
  rules and show when the data was last updated.
- Show the provider's required attribution.
- **Never invent sample data and present it as live.** When quota runs out
  or the provider is down, show an honest "unavailable" or labelled cached
  state.

### Keys

If the provider needs a key, it is read **on the server** from an
environment variable. Add the name, with a placeholder value only, to the
example env file, and document local and hosting setup. Never paste a real
key into a prompt, a commit, a log or a browser bundle. A public env prefix
(`NEXT_PUBLIC_`, `VITE_`, …) is wrong for a private credential.

## 4. Test the failure paths before sharing

Exercise and report each one:

| Case | How |
|---|---|
| valid response | one minimal live call, only if configured and allowed; don't burn quota |
| missing fields, empty result | deterministic mock, labelled as a mock |
| timeout, non-2xx | mock |
| 429 rate limit | mock; the UI degrades honestly |
| missing or invalid key (if auth) | mock; 401/403 handled clearly |

Also confirm the key cannot reach the client bundle or logs, and check
units, timestamps, attribution and caching. Run the project's tests and
production build. Report **what passed, what failed, and what was not
tested**; untested behaviour is never called verified. Keep mocked checks
separate from live ones, so it is clear which behaviour was actually seen.

Clues: 401/403 means auth or permission, 429 means rate limit, and a failure
only in the browser often means CORS. Read the actual response and the docs
before changing code.

## 5. Record it

In the README: provider links, env-var names, field mapping, test results,
and remaining limits. Before a commercial launch: confirm provider
permissions, estimate calls per user, set production credentials, and
decide what the app does when the API is down.

## Worked example: Open-Meteo (non-commercial)

Docs: https://open-meteo.com/en/docs · limits and commercial plans:
https://open-meteo.com/en/pricing. No key needed for non-commercial use;
attribution required.

```bash
curl --fail --show-error "https://api.open-meteo.com/v1/forecast?latitude=37.77&longitude=-122.42&current=temperature_2m&timezone=auto"
```

The response carries `current.temperature_2m`, `current.time` and
`current_units.temperature_2m`. A weather card shows the location, the
temperature with the unit from `current_units`, and the provider timestamp
labelled in the returned timezone.

## Prompt templates

**Check the provider**
> I want to add [one feature] to this project for [audience]. Read these
> official sources: [API docs URL], [pricing URL], [usage terms URL].
> Summarise the endpoint, required parameters, authentication, response
> fields, request limits, attribution and commercial-use requirements, citing
> the URLs. If a page cannot be accessed or a requirement is unclear, say so
> and ask for the excerpt. Inspect the project and propose the smallest
> integration. Do not change files yet.

**Integrate**
> Build [feature] using [docs URL] in this project. Use [endpoint] and display
> only [fields], verified against the current docs. If a private key is
> needed, read it on the server from [ENV_VAR_NAME], and add a placeholder to
> the example env file. Validate inputs and responses; add a timeout, clear
> errors, and handling for auth failures and rate limits. Follow the
> documented caching and attribution rules. Do not invent sample data. Run
> the relevant checks and list what still needs a real credential.

**Verify**
> Review this integration against the provider docs. Check a valid response,
> missing fields, empty result, timeout, non-2xx, rate limit and (if auth)
> missing/invalid key, using labelled mocks for the failures. Confirm keys
> cannot reach the client bundle or logs. Run tests and the production build.
> Report what passed, what failed and what was not tested.
