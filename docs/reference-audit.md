# Reference audit

The master prompt asks for an audit of a user-supplied ZIP reference before coding.

## Finding: no ZIP present

Searched the repository root, the parent directory, and the sibling project
folder available in this environment. **No ZIP, archive, screenshot, or video
reference was supplied.** Recording that fact and continuing from the
specification, as the prompt directs.

```
/home/user/
├── InteriorCleanse/   # unrelated single-tenant Next.js storefront (see below)
└── aurelis-os/        # this project
```

## The one adjacent artifact, and why almost none of it was reused

`/home/user/InteriorCleanse` is a single-business storefront that contains a
voice assistant built to the same *product concept* — browser speech input, a
Claude tool-calling loop over live business data, an integration health screen.
It is the origin of this product idea, so it is worth stating precisely what
carried over and what did not.

**Pattern reused (concept only, no files copied):**

| Pattern | How it appears here |
| --- | --- |
| Web Speech API for voice, with a typed fallback | Planned for Checkpoint 4 behind `SpeechToTextProvider` / `TextToSpeechProvider` interfaces, so voice is swappable and optional |
| Tool-calling loop with typed tools | Checkpoint 4, with the added requirement that write tools produce an approval record first |
| Tool failures returned to the model as errors, never as invented numbers | Carried forward as a non-negotiable — it maps directly to "the assistant must never bluff" |
| Integration health as a first-class screen | Checkpoint 5, extended to per-tenant connector status |

**Deliberately NOT carried over:**

| Rejected | Why |
| --- | --- |
| Reading integration keys from `process.env` | Fatal for multi-tenancy. One business's keys in the process environment cannot be scoped per customer. Replaced by per-tenant credentials in the database. |
| A single shared admin password + HMAC cookie | Adequate for one owner; unusable for many customers with teams and roles. Replaced by Supabase Auth plus eight roles across two permission domains. |
| App-layer-only access checks | Every query becomes a place to forget a filter. Replaced by Postgres RLS as the enforcement layer. |
| The "JARVIS" name and Iron Man visual language | Marvel/Disney trademark and trade dress. Unacceptable in a product that is branded, marketed, and sold. Replaced by an original identity that is configurable via environment variables. |
| Any code, asset, or copy | This is a separate product with separate ownership. Nothing was copied. |

## How this specification improves on the reference

1. Isolation is enforced by the database, not by developer discipline.
2. Credentials are per-tenant rather than per-deployment.
3. Roles separate the vendor's staff from the customer's team; neither implies the other.
4. Metrics are required to carry a formula, source, currency, and freshness.
5. Assistant write actions require an explicit, argument-bound approval.
6. Branding is configuration, so the product can be licensed and white-labeled.
