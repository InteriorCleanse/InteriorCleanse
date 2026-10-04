# The Picked AI team

Eleven Claude agents that do the daily work of running Picked: drafting content,
answering customers, watching stock, keeping the books, finding stores, and
checking every word against the claims rules. You stay the CEO. The agents
draft and prepare; you approve and act.

This folder is a kit. It runs in **Picked's own repository** (see "Set it up"
below), not here. Nothing in it is active until you copy it there.

## What it can and can't do

**The team does:** first drafts of every post, email, reply, and pitch; the
weekly numbers; stock and reorder math; lot result checks against spec; store
lead lists; competitor and label watching; a compliance read of everything
before you see it.

**Only you do:** taste the product, sign anything, pay anything, press
publish or send, talk to the lawyer and the manufacturer on calls, film the
founder videos, and decide. You are also the one legally responsible for
every claim the brand makes, which is why nothing reaches the public without
your yes.

## The org chart

```
                         YOU (owner, CEO)
                              │  approve / reject
                    ┌─────────┴─────────┐
                    │   chief-of-staff  │  Opus: daily brief, weekly
                    │   (orchestrator)  │  report, routes work
                    └─────────┬─────────┘
                              │
         every public draft passes through
                    ┌─────────┴─────────┐
                    │  brand-guardian   │  Opus: claims, voice,
                    │  (compliance)     │  the Picked Standard
                    └─────────┬─────────┘
       ┌───────────┬──────────┼──────────┬───────────┐
   GROWTH       CUSTOMERS   OPERATIONS   MONEY      QUALITY
   content-     community-  ops-         finance    quality-
   studio       support     inventory               lot-book
   creator-desk                                     (Opus)
   lifecycle-email
   retail-sales
   research-insights
```

| Agent | Model | What it owns | Runs |
| --- | --- | --- | --- |
| `chief-of-staff` | Opus | Morning brief, Sunday report, routing work, keeping the to-do list honest | Daily, Sunday |
| `brand-guardian` | Opus | Reviews every public draft against the claims rules, voice, and the Picked Standard. Can block, never publish | After every drafting agent |
| `quality-lot-book` | Opus | Reads each lot's certificate of analysis against spec, drafts the Lot Book entry, flags anything off | When a lot arrives |
| `content-studio` | Sonnet | TikTok and Reels scripts, captions, carousels, the posting calendar | Mon, Wed, Fri |
| `creator-desk` | Sonnet | Finds micro-creators, drafts gifting messages and briefs with disclosure, tracks who posted | Weekly, Wednesday |
| `lifecycle-email` | Sonnet | Klaviyo campaigns and flow copy, the waitlist, launch, and vote emails | Weekly, Tuesday |
| `community-support` | Sonnet | Draft replies to customer emails, DMs, comments, and reviews | Daily (on your machine, see privacy) |
| `retail-sales` | Sonnet | Local store and gym leads, pitch emails, follow-ups, the store ladder tracker | Weekly, Thursday |
| `ops-inventory` | Sonnet | Stock on hand, weeks of cover, reorder dates, lot tracking sheet, supplier follow-ups | Weekly, Monday |
| `finance` | Sonnet | Weekly numbers, cash, unit economics, sales tax thresholds | Weekly, Sunday |
| `research-insights` | Sonnet | Competitor launches, label changes, review mining, new rules that affect Picked | Monthly, 1st |

Opus goes where judgment protects the brand: deciding, compliance, and
quality. Sonnet does the volume work well and costs less. If usage runs high,
move `research-insights` to Haiku first.

## The approval rule

**Agents draft. You decide. Nothing reaches a customer, a store, a supplier,
or the public without your explicit yes.** This is built in three ways, not
just written down:

1. **Agents have no publishing tools.** No social account logins, no Klaviyo
   send rights, no payment access, no store admin. See `repo-template/claude/settings.json`.
2. **Every output is a file in `outbox/`,** delivered as a pull request. The
   pull request is your approval queue: read it on your phone, comment to
   ask for changes, merge to approve. Then you post, send, or paste it.
3. **`brand-guardian` signs off first.** Each draft carries a review block
   at the bottom (pass, or the exact line to fix). You never see a draft that
   hasn't been checked.

**Stop conditions.** Any agent stops and flags you, instead of drafting, when
it meets: a customer reporting illness or a reaction (this is an adverse
event; follow `legal/adverse-event-sop.md`), a lot result outside spec, a
legal threat, a press inquiry, a retailer contract, or anything that would
need a health claim to answer.

## A day with the team

| When | What happens | Your time |
| --- | --- | --- |
| 7:45 | `chief-of-staff` posts the brief: yesterday's numbers, what's waiting for you, the three things that matter today | 5 min |
| Morning | Review the `outbox/` pull request: posts, replies, emails. Merge or comment | 15 min |
| Midday | Post the approved content. Send the approved replies | 15 min |
| Afternoon | The work only you can do: calls, samples, store visits, filming | the rest |
| Sunday 6pm | `finance` and `chief-of-staff` post the weekly report: the five numbers, cash, stock, next week's plan | 20 min |

About 35 minutes a day of review in exchange for most of the drafting.

## Set it up

### Before the team: one command

The agents need a repository of their own. From a copy of this repository on
your computer, run:

```
bash docs/business/picked/ai-team/setup-picked-repo.sh ~/picked
```

It builds `~/picked` with every Picked document, installs the eleven agents
in `.claude/agents/`, the permission settings, `CLAUDE.md`, and `.gitignore`,
creates the working folders (`outbox/`, `briefs/`, `data/`, `lots/`,
`trackers/` with the supplier list already filled in), and makes the first
commit. It never pushes. Then create an empty private GitHub repository named
`picked` and run the two lines it prints.

### Phase 1: run it by hand (week 1 to 2)

Open Claude Code in the `picked` repository and run each agent yourself so
you see what it makes before you trust a schedule:

```
claude
> Use the content-studio agent to draft this week's three videos
> Use the brand-guardian agent to review outbox/2026-10-12-content.md
```

Fix the agent prompts where a draft misses. The prompts are plain text in
`.claude/agents/`; edit them like any document.

### Phase 2: put it on a schedule (week 3 on)

Create the routines in `routines.md`. Each is a scheduled Claude Code session
(a "routine") that runs in the cloud against the `picked` repository, does
its job, and opens a pull request with its drafts. Create them from
claude.ai/code, or ask Claude Code in any session to "create a routine" with
the prompt and schedule from `routines.md`.

The alternative is Anthropic's Managed Agents platform, which can run agents
on a schedule as hosted deployments. It suits the team once it runs every
day without edits and you want it off your Claude plan and on an API bill.
Stay on routines until then: they're simpler and you can read every run.

### Phase 3: connect the tools, read-only first (month 2 on)

Start with files: you export a weekly sales summary from Shopify and drop it
in `data/`. Once the drafts are reliable, connect read-only access:

| Tool | How the agent reads it | Who uses it |
| --- | --- | --- |
| Shopify | Analytics exports at first; later the Shopify Admin API with a read-only custom app token | finance, ops-inventory, chief-of-staff |
| Klaviyo | Campaign and flow reports exported weekly; later a read-only private API key | lifecycle-email, finance |
| Google Drive or Notion | A connector in Claude, for the lot sheet and tracker | ops-inventory, quality-lot-book |
| Social analytics | Weekly screenshots or exports from Instagram and TikTok | content-studio, chief-of-staff |

Store every key as an environment secret in the routine's environment
settings, never in a file. Give agents read-only keys. Write access (for
example, saving a Klaviyo draft campaign) comes only after a month of clean
drafts, and only for drafts, never sends.

## Privacy: customer data stays off the schedule

Customer names, emails, addresses, and order details never go into the
repository, and never into a cloud routine. Picked sells to people who may
share health details in messages, which Washington's My Health My Data Act
and `legal/consumer-health-data-policy.md` both treat as sensitive.

So `community-support` runs **on your own computer**, on demand, against
messages you paste in or a local `data/private/` folder that is listed in
`.gitignore` and blocked in the agent settings. Every other agent works on
aggregated numbers and public information only.

## What it costs

Routines and Claude Code run on your Claude plan, so the team adds no
separate bill to start. Eleven agents on the schedule in `routines.md` is about
25 runs a week. Watch your usage for the first two weeks; if you hit limits,
cut `content-studio` to twice a week and move `research-insights` to Haiku
before upgrading the plan. Moving to Managed Agents later means paying per
token on the API instead.

## Files

| File | What it is |
| --- | --- |
| `README.md` | This page |
| `routines.md` | The schedule: every routine's cron time and its exact prompt |
| `repo-template/CLAUDE.template.md` | The rules every agent reads first. Becomes `CLAUDE.md` in the picked repository |
| `repo-template/claude/agents/*.md` | The eleven agents. Becomes `.claude/agents/` |
| `repo-template/claude/settings.json` | Permission settings that keep agents to drafting. Becomes `.claude/settings.json` |
| `repo-template/gitignore.txt` | Keeps customer data out of git. Becomes `.gitignore` |
| `repo-template/trackers/` | Supplier list (filled in from the research), and empty creator, store, and lot trackers |
| `repo-template/lots/SPEC.md` | The finished-product spec every lot is checked against. Fill it from the final formula |
| `repo-template/data/README.md` | Which weekly exports to drop in `data/`, and which never to |
| `setup-picked-repo.sh` | Builds the picked repository from all of the above in one step |
