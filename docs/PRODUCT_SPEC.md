# Product spec

## What it is

A multi-tenant subscription business operating system. It connects a business's
real data, calculates profit that can be traced back to source records, and
provides a voice-and-text analyst that answers from that data.

The homepage promise, in plain language: **know what is making money, what is
wasting money, and what to do next.**

## What it must never do

1. Invent production data. Demo data lives only in a labelled Demo Workspace.
2. Show a metric without a formula, source, range, currency, and freshness.
3. Blur facts, calculations, estimates, forecasts, and recommendations.
4. Bluff. Confidence is fine; unearned certainty is not.
5. Perform a consequential external write without a preview and human approval.
6. Rely on the interface for isolation or authorization.
7. Promise revenue, profit, or any commercial outcome.

## Identity

Original and legally distinct. No Marvel/Iron Man naming, dialogue, sound, logo,
or HUD composition. Name, logo, colours, assistant name, plan names, and
marketing copy are configurable through environment variables — the working name
`AURELIS OS` and assistant name `Aurelis` are defaults, not hardcoded.

## Users

| Role | Needs |
| --- | --- |
| Owner-operator | One screen answering sell/spend/keep/next |
| Analyst | Formulas, attribution, lineage, exports |
| Vendor support | Read-only visibility, never silent mutation |
| Vendor owner | MRR, churn, activation, AI cost per tenant, margin |

Progressive disclosure: a beginner sees a simple answer; an advanced user opens
the formula, the attribution model, and the raw records behind it.

## Delivered so far (Checkpoint 1)

Signup and login; workspace creation; eight roles across two permission domains;
database-enforced tenant isolation; audited single-claim platform ownership; a
command center shell that shows pending metrics as pending rather than faking
them.
