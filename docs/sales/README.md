# Sales system

Built 2026-09-27 for high-value accounts: family offices, wealth advisors,
chiefs of staff, and the founders they serve. Every file obeys the rules in
`docs/BUSINESS_BUILD_PLAN.md`: nothing invented, no private individual named
as a target, no message sent by an agent, no scraping.

| File | What it is | Read it when |
| --- | --- | --- |
| `HIGH_VALUE_SERVICES.md` | How this buyer buys, nine services scored, an entry and an anchor recommendation, ten rapport principles, three owner decisions | First. The decisions at the end gate everything else |
| `LEAD_ENGINE.md` | Three ideal customer profiles, lawful public-source playbook, target list schema and scoring, automation spec, 21-day gatekeeper sequence, weekly rhythm | Before the first outreach |
| `target-accounts.csv` | The list, header row only until the owner fills it from public signals | Every Monday |
| `SCRIPTS.md` | Referral ask, gatekeeper call, discovery call, twelve objections, voicemail, proposal, post-call, call block structure, worked family office example | Before every call |
| `TRAINING.md` | Twelve weeks, 45 minutes a day, Claude as the buyer, rubrics, sources | Daily; start with `/sales-drill 1.1` |
| `training-log.csv` | One line per drill, written by `/sales-drill` | Fridays |

## Order of operations

1. Answer the three decisions at the end of `HIGH_VALUE_SERVICES.md`: lead
   service, metro, minimum engagement price.
2. Build the proof assets in its section 3 (case study from real work,
   security and discretion policy, NDA, insurance, clean profile and site).
3. Start `/sales-drill 1.1` the same day; the programme does not wait on
   step 2.
4. Fill ten rows of `target-accounts.csv` from the public sources in
   `LEAD_ENGINE.md` section 2, scored by section 3.
5. Run the 21-day sequence on those ten. The owner reads every message
   before it goes.
