---
name: model-compare
description: Sends one prompt to several AI models at once (ChatGPT, Claude, Gemini, Grok and others through OpenRouter, or local models through Ollama or LM Studio) and puts the answers side by side, with time and tokens, so you pick the one that actually solved it. Use when asked to compare models, get a second opinion from other models, or decide which model suits a task.
---

# Model compare: one prompt, several models, side by side

The useful half of the "G0DM0D3" single-file chat client, and nothing else:
one prompt goes to up to six models in parallel, and their answers come back
in one report. **Your prompt, your models.** No preset prompt strategies are
bundled, and none are added.

## When to use it

- "Which model is better at this?" Run the task and read the answers side by side.
- A second opinion on a hard question, a piece of code, or a plan.
- Checking whether two paid AI subscriptions are both worth keeping.

## Setup, once, on the machine running Claude Code

- **OpenRouter** (one key reaches most hosted models, billed pay-as-you-go
  per call; some models are free): create a key at openrouter.ai, then
  `export OPENROUTER_API_KEY=...` in your shell profile. **Never put the key
  in a file in this repository**, in a prompt, or in a commit.
- **Fully local and free**: run Ollama (`http://localhost:11434/v1`) or LM
  Studio (`http://localhost:1234/v1`) and pass `--base`. Nothing leaves the
  machine and no key is needed.
- Node 18 or newer. No install step.

## Run it

```bash
node .claude/skills/model-compare/scripts/compare.mjs \
  --models "openai/<model>,anthropic/<model>,google/<model>,x-ai/<model>" \
  --prompt "Explain the difference between a stop order and a stop-limit order in three sentences." \
  --out /tmp/compare.md
```

Take model ids from https://openrouter.ai/models; they change, so check the
current list rather than guessing. For local models use the names your
server lists, e.g. `--base http://localhost:11434/v1 --models llama3.2,qwen2.5`.

Options: `--system` (the same system prompt for every model),
`--prompt-file`, `--timeout` (seconds per model, default 90), `--max-tokens`
(default 1024), `--out`. At most six models per run.

## How Claude should use it

1. Ask for or choose the models (at most six), and confirm the user is happy
   to spend their provider credit. Every call is billed by their provider.
2. Run the script with the user's prompt, verbatim.
3. Read the report and give a short verdict per model: correct or not,
   complete or not, and where they disagree. Say which answered best **for
   this prompt**, and quote the key lines. One prompt is one sample, so do
   not declare a model "the best" in general.
4. Report failures as they are (HTTP status, timeout, unknown model id).
   Never fill a failed pane with a guess of what the model would have said.

## Limits and safety

- Answers go straight to each provider: whatever you send, they see. Keep
  secrets, keys and personal data out of prompts.
- Output is capped by `--max-tokens`; a `length` finish reason means an
  answer was cut off, not that the model stopped.
- The script only sends a prompt and prints replies. It does not run code
  the models return.
