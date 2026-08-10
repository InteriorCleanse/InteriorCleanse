# Kie.ai Asset Pipeline

**Status: not started.** No `KIE_API_KEY`, no adapter, no task store, no
callback route. This document is the build specification, not a description of
existing code.

## Two workflows, deliberately separate

They differ in who triggers them, what they cost, and what happens when they
fail — so they do not share a queue.

### 1. Website asset pipeline (admin/script only)

Generates editorial room scenes, material backgrounds, category campaign
visuals, depth layers for Mode C, and optional motion loops.

- Driven by a **prompt manifest** (`content/asset-manifest.json`) so the visual
  language is reproducible and re-runnable, not improvised per asset.
- Outputs are optimized and committed as ordinary static assets.
- **No runtime dependency.** A normal page view never calls Kie.ai. If Kie.ai is
  down, the site is unaffected.

### 2. Customer AI studio (authenticated users)

Room upload → edit workflow, per-user job queue, credits/plan limits, project
history, retries, and user-initiated deletion.

Requires a database and authenticated accounts. Blocked until those exist.

## Security requirements

Non-negotiable:

- `KIE_API_KEY` is **server-only**. It must never appear in browser JavaScript,
  in a `NEXT_PUBLIC_` variable, or in a client component.
- Validate upload MIME type and byte size before forwarding anything.
- Rate limit per user and per IP.
- Moderate uploads and prompts before submission.
- Never log secret headers. Log the task ID, not the authorization.
- Persist task ID, model, prompt, seed/settings, input asset, output asset,
  timestamps, status, error, and cost metadata.
- Per-user and per-plan generation caps, plus an account-level budget ceiling
  that hard-stops submission — not merely a warning.

## Asynchronous job handling

A successful create call returns a **task ID, not an image**. Anything that
treats the create response as a finished asset is wrong.

Required state machine:

```
queued → processing → completed
                    ↘ failed
```

- Persist the task before returning to the caller.
- Verified callback/webhook is the fast path.
- **Polling is the reliability fallback**, not the primary mechanism. Callbacks
  get dropped.
- Callbacks must be **idempotent** — the same completion delivered twice must
  not double-charge, double-store, or double-notify.
- Copy completed assets into our own storage. Provider URLs are temporary and
  will 404 eventually; a product image that expires is a broken storefront.

## The product-accuracy rule

This is the constraint that matters most commercially, because violating it
means shipping a product image that is not the product.

**Kie.ai may generate:** lifestyle environments, room settings, lighting
variations, category scenes, editorial backdrops, non-product decorative
elements, and design concepts.

**Kie.ai must never alter:** book cover wording, author names, logos, product
artwork, Printful/Printify print files, product shape, variant colour,
wallpaper master artwork, or any regulated claim.

**The mechanism:** generate the environment, then **composite the exact approved
product image, cover, or texture onto it** as a separate step. The product pixels
come from the approved asset; only the scene around them is generated. Any
pipeline that hands the product image to the model as an editable input has
already failed this rule.

## Licensing

Record the commercial-use terms of the specific Kie.ai model used for each
generated asset, alongside the asset. Model terms differ and change; a generated
image with unknown provenance cannot be safely used in a campaign.

## Honest labelling

A generated concept is a **photorealistic visualization**. It is not a
CAD-accurate, editable 3D room, and the AI studio UI must not imply that it is
unless an actual depth/mesh/floor-plan pipeline is built behind it.
