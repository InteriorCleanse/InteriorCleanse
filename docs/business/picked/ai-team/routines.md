# Routines: the team's schedule

Each routine is a scheduled Claude Code session that runs against the `picked`
repository, uses one or more agents, and opens a pull request with its
drafts. You approve by merging.

**Time zone.** Replace `America/New_York` with yours. Times avoid the top of
the hour on purpose, because scheduled jobs bunch up there.

**Create them** at claude.ai/code (Routines), or in any Claude Code session
connected to the `picked` repository: "Create a routine named <name>, cron
<cron>, with this prompt: <prompt>". Choose "new session each run" so every
run starts clean from the latest files.

**Start with three.** Run `daily-brief`, `content-week`, and `sunday-report`
for two weeks. Add the rest once those drafts need few edits.

## The common ending

Every prompt below ends with this paragraph. It's written out once here;
paste it at the end of each prompt.

> When the drafts are done, have the brand-guardian agent review every
> public-facing file you created, then create a branch named
> `agents/<routine-name>-<YYYY-MM-DD>`, commit only files in `outbox/`,
> `briefs/`, `trackers/`, and `lots/`, push the branch, and open a pull
> request titled "<routine name>: <date>" whose description lists each file
> with one line on what it is and its brand-guardian result. Never push to
> main, never merge, never send or publish anything. If you hit a stop
> condition from CLAUDE.md, put the FLAG file first in the pull request
> description.

## The schedule

| Routine | When | Cron | Agents | Output |
| --- | --- | --- | --- | --- |
| `daily-brief` | Every day, 7:47 | `CRON_TZ=America/New_York 47 7 * * *` | chief-of-staff | `briefs/` |
| `content-week` | Mon, Wed, Fri, 6:53 | `CRON_TZ=America/New_York 53 6 * * 1,3,5` | content-studio, brand-guardian | `outbox/` |
| `ops-check` | Monday, 8:12 | `CRON_TZ=America/New_York 12 8 * * 1` | ops-inventory | `outbox/` |
| `email-week` | Tuesday, 8:22 | `CRON_TZ=America/New_York 22 8 * * 2` | lifecycle-email, brand-guardian | `outbox/` |
| `creator-week` | Wednesday, 9:17 | `CRON_TZ=America/New_York 17 9 * * 3` | creator-desk, brand-guardian | `outbox/`, `trackers/` |
| `stores-week` | Thursday, 8:37 | `CRON_TZ=America/New_York 37 8 * * 4` | retail-sales, brand-guardian | `outbox/`, `trackers/` |
| `sunday-report` | Sunday, 17:43 | `CRON_TZ=America/New_York 43 17 * * 0` | finance, chief-of-staff | `briefs/` |
| `monthly-research` | 1st of the month, 7:23 | `CRON_TZ=America/New_York 23 7 1 * *` | research-insights | `outbox/` |
| `monthly-compliance` | 15th of the month, 7:23 | `CRON_TZ=America/New_York 23 7 15 * *` | brand-guardian | `outbox/` |
| `lot-review` | On demand, when a COA arrives | none (run it from the routine page) | quality-lot-book | `lots/`, `outbox/` |

`community-support` has no routine on purpose: it handles customer messages,
so it runs only on your own computer (see `README.md`, Privacy).

About 25 runs a week in total.

## The prompts

### daily-brief

```
Use the chief-of-staff agent to write today's daily brief in
briefs/<today>.md, following its "Daily brief" instructions. Read every open
file in outbox/ and every FLAG file. Use only numbers present in data/; write
"no data" for anything missing. Keep it to one phone screen.
[common ending]
```

### content-week

```
Use the content-studio agent to draft the next three videos from
MARKETING_PLAN.md's current week, plus one Instagram carousel and captions
for each platform. Check briefs/ for the latest weekly report and favor the
formats that performed best. Don't repeat a hook used in the last 30 days of
outbox/. Save to outbox/<today>-content-studio.md.
[common ending]
```

### ops-check

```
Use the ops-inventory agent to run the weekly stock check from the latest
data/stock-*.csv and data/sales-*.csv, update reorder dates, and draft any
supplier follow-ups that are past due in trackers/suppliers.csv. If no stock
exists yet (pre-launch), report only supplier follow-ups and the next
supply-chain milestone in TIMELINE.md.
[common ending]
```

### email-week

```
Use the lifecycle-email agent to draft this week's campaign from
MARKETING_PLAN.md and review the latest data/email-*.csv. Propose one test.
Pre-launch, the campaign goes to the waitlist; never promise a date the
owner hasn't confirmed in TIMELINE.md.
[common ending]
```

### creator-week

```
Use the creator-desk agent to add 15 new micro-creators to
trackers/creators.csv from public profiles, then draft personal gifting
messages for the 5 best fits. Pre-launch, the message invites them to the
waitlist and the first batch; it promises nothing that doesn't exist.
[common ending]
```

### stores-week

```
Use the retail-sales agent to add 10 leads for the current store-ladder rung
to trackers/stores.csv, draft pitches for the 5 best, and draft follow-ups
for every lead whose next date has passed. Pre-launch, pitches ask for a
tasting visit when samples exist and say when that will be.
[common ending]
```

### sunday-report

```
Use the finance agent to write briefs/<YYYY-Www>-numbers.md from data/, then
use the chief-of-staff agent to write the weekly report
briefs/<YYYY-Www>-weekly.md from it and the week's merged and open pull
requests. One honest risk, five tasks for next week.
[common ending]
```

### monthly-research

```
Use the research-insights agent to write this month's market brief,
following its "Monthly brief" instructions. Every fact has a source link.
Mark rule changes "act now", "watch", or "no effect".
[common ending]
```

### monthly-compliance

```
Use the brand-guardian agent to audit every public page and message: site/
(every HTML file), marketing/PRODUCT_COPY.md, marketing/EMAIL.md, and the
last 30 days of merged files in outbox/. Write one report to
outbox/<today>-compliance-audit.md listing each problem with file, line,
exact fix, and rule. Also check LEGAL.md's "VERIFY" items and list any whose
date has passed.
[common ending]
```

### lot-review

```
Use the quality-lot-book agent to review lot <LOT NUMBER> from the files in
lots/<LOT NUMBER>/, following its "When a COA arrives" instructions. If
anything fails, is missing, or doesn't match, write the FLAG file and stop.
[common ending]
```

## Before you trust a routine

- Run it by hand first ("Run now" on the routine page) and read the pull
  request.
- For the first two weeks, read every file before merging, not just the
  description.
- If a routine fails or opens an empty pull request twice in a row, pause it
  and run the agent by hand to see why.
- Re-read `CLAUDE.md` once a month. When a rule changes (a price, a fruit
  gram number, a new state law), change it there and every agent follows.
