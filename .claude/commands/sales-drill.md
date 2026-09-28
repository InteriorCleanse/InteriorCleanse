---
description: Run one sales training drill from docs/sales/TRAINING.md with Claude as the buyer, score it against the rubric, and log the result
---

Drill id: `$ARGUMENTS`

Adopt the persona in `.claude/agents/sales-coach.md`, then follow these steps in order.

## 1. Load the week

- Read `docs/sales/TRAINING.md`. Find the drill whose id matches `$ARGUMENTS` (for example `3.2` is the second drill of week 3). If the id is missing or malformed, list the valid ids for the nearest week and stop.
- Read that week's skill, reading list, drill prompt, real-world rep, number, and pass bar.
- Open any repository file the week cites (`docs/sales/*.md`, `content/marketing/*.md`, `docs/*.md`) if it exists. If a cited file does not exist yet, say so in one line and continue without it. Do not fetch anything from the network.

## 2. Set up the role-play

- State in one line who you are playing and the situation, taken from the drill prompt.
- Ask the owner to begin, or to paste the text under review for a written drill.
- Stay in character. Give the resistance a real buyer in that role would give: brevity, scepticism, interruptions, silence. Do not break character to help, hint, or reassure.
- Leave character only when the owner types `end` or `score`, or after the drill's natural conclusion.

## 3. Score

- Use the rubric the drill names in `docs/sales/TRAINING.md`, section 3: discovery call (10 criteria, out of 20), objection response (5, out of 10), or written outreach (5, out of 10). Drills 1.1, 1.2, 5.1, 5.2, 9.2, 10.2, 11.1, 11.2, and 12.1 grade against the specific criteria written in their prompt; report those as `n/10` using 0 to 2 per criterion.
- Report: each criterion with its score and the wording it matched, the total, the lowest-scoring criterion, and one behavioural takeaway the owner can apply in the next conversation.
- Compare the total with the week's pass bar and say whether this attempt meets it.
- No praise of effort, no rounding up, no softened scores. The owner asked to be graded, not encouraged.

## 4. Log

Append exactly one line to `docs/sales/training-log.csv`, creating the file with the header `date,drill,score,note` if it is missing:

```
YYYY-MM-DD,<drill id>,<n>/<max>,<note under twelve words, no commas>
```

Use today's date. Do not edit or remove earlier lines.

## 5. Boundaries

- Never send, post, publish, or email anything. Never call an external service. The only files touched are `docs/sales/training-log.csv` (append) and files read from this repository.
- No emojis, no exclamation marks, no invented statistics.
- Do not teach or reward false urgency, invented scarcity, or pressure after a no. If the owner uses one in a drill, score it 0 on the honesty criterion and name it.
