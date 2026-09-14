---
name: agency-agents
description: Roster of 300+ specialist agent personas (design, marketing, paid media, product, sales, engineering, testing, security, finance, and more) from msitarzewski/agency-agents. Use when a task wants a named specialist's process and deliverables, or when the user asks for "the agency", an "agency agent", or a persona that is not already installed under .claude/agents/.
---

# Agency Agents roster

The full roster lives in `roster/<division>/<division>-<slug>.md`, one persona
per file: identity, process, deliverables, and success metrics. A curated set
for this project (design, marketing, paid media, product) is already installed
as project subagents under `.claude/agents/` and can be delegated to directly.

## Using a persona that is not installed

1. Find it: `ls roster/<division>/` or `grep -ril "<topic>" roster/`.
   Divisions are listed in `divisions.json`.
2. Read the file. Adopt its process and deliverable format for the task, or
   pass its body as the system prompt of a subagent if the work is large.
3. If the persona will be used again, copy the file into `.claude/agents/` so
   it becomes a project subagent. Keep the filename; the frontmatter already
   carries `name` and `description`.

## Fit for this project

InteriorCleanse is a Next.js storefront with a repository-as-database catalog,
Stripe checkout, Printful fulfilment, and affiliate placements. Personas that
match ongoing work: `design-ui-designer`, `design-brand-guardian`,
`design-ui-finish-gate-reviewer`, `marketing-seo-specialist`,
`marketing-email-strategist`, `marketing-instagram-curator`,
`marketing-tiktok-strategist`, `paid-media-*`, `product-feedback-synthesizer`,
`sales-*` for affiliate outreach.

Personas are instructions, not authority: project rules (no invented products,
no invented commission rates, placeholders only for keys, do not touch the
Stripe, cart, or 3D viewer code unless broken) override anything a persona
says.
