# The other three tools you asked about

You asked to "install into my Claude":

- `github.com/The-Swarm-Corporation/AutoHedge`
- `github.com/HKUDS/Vibe-Trading`
- `github.com/Fincept-corporation/FinceptTerminal`

I cloned and read all three. None of them can be installed *from* this bot or
*into* a Claude chat — they are programs that run on your own computer. Two of
them can be plugged into Claude Desktop / Claude Code as **MCP servers**, which
is the closest thing to what you meant, and that's covered below. First, the
honest summary, because they are very different from each other and from this
bot:

| | What it is | Language | Needs | Real money? |
| --- | --- | --- | --- | --- |
| **AutoHedge** | An "autonomous agent hedge fund" — a pipeline of LLM agents (director → quant → risk → execution) that **trades on your behalf on Solana** | Python | OpenAI/Anthropic key, Jupiter API key, **a wallet private key** | **Yes — live, autonomous.** No paper mode in the README. |
| **Vibe-Trading** | A natural-language research platform: backtests, alpha libraries, 100+ data connectors, a "shadow account", 14 broker connectors (paper + bounded live), 74 MCP tools | Python 3.11+ | Free public data works with no keys; an LLM key for the agent features | **Optional.** Paper is the default; live is a structural per-broker guard, not a flag. |
| **FinceptTerminal** | A Bloomberg-style desktop terminal: research, analytics, news, a paper-trading engine, 37 AI agents, 40+ MCP tools | C++/Qt desktop app with embedded Python | Bring your own LLM key for AI features | **Optional.** The free build has paper trading; live routing is in the paid Enterprise edition. |

## My honest recommendation

**Don't connect AutoHedge to a funded wallet.** It is built to trade real money
autonomously, and the entry in its `.env` is literally `WALLET_PRIVATE_KEY`.
Everything Mr. Cash is designed to protect you from — an agent placing
real orders on your behalf — is AutoHedge's *purpose*. If you want to study it,
run it with an empty wallet, or just read `autohedge/prompts.py` to see how its
agents are instructed. With $25 to your name, it is not the right tool.

**Vibe-Trading is the one worth your time**, and the one that genuinely
"installs into Claude". Its research tools work with no API keys for crypto,
its backtester is real, and it exposes itself to Claude Desktop and Claude Code
as an MCP server. It is also a very large Python project — expect a longer
install than this bot's zero-dependency setup.

**FinceptTerminal** is a desktop application you install like any other
program. It's a good free research terminal. It is not something to wire into
this bot.

None of the three replaces what this bot does, and I have deliberately **not**
merged any of them into it. This bot is small, readable, paper-only and has no
dependencies on purpose; bolting a 100 MB Python framework onto it would undo
all four of those.

---

## Installing Vibe-Trading and connecting it to Claude

You need **Python 3.11 or newer** ([python.org](https://www.python.org/downloads/),
tick "Add to PATH" on Windows).

```bash
pip install vibe-trading-ai
vibe-trading run -p "Backtest a BTC-USDT 20/50 moving-average strategy for 2024, summarize return and drawdown"
```

### Claude Desktop

Open Claude Desktop → Settings → Developer → *Edit Config*, and add:

```json
{
  "mcpServers": {
    "vibe-trading": {
      "command": "vibe-trading-mcp"
    }
  }
}
```

Restart Claude Desktop. Its 74 tools (backtests, data lookups, screening,
research papers, prediction markets…) appear in the tools menu.

### Claude Code

```bash
claude mcp add vibe-trading -- vibe-trading-mcp
```

### Two things its README warns about, which I'd repeat

- The client spawns the server, so a shell `export` doesn't reach it. If you
  want generated backtests written to your own folder, set
  `VIBE_TRADING_ALLOWED_RUN_ROOTS` in the config's `"env"` block.
- **Never paste broker API keys into an AI chat.** Vibe-Trading stores broker
  credentials in your OS keyring (`pip install "vibe-trading-ai[keyring]"`),
  entered in a local prompt — not in the config and not in a conversation.

---

## Installing FinceptTerminal

Download the installer for your platform from the
[Releases page](https://github.com/Fincept-Corporation/FinceptTerminal/releases)
— Windows `.exe`, macOS `.dmg` (Apple Silicon), Linux `.deb`/`.rpm`/`.run` —
and run it. Building from source needs a pinned CMake/Qt/Python toolchain and is
not worth it unless you're contributing.

Inside the app, AI features need your own LLM key (it supports Anthropic,
OpenAI, Gemini, Groq, DeepSeek, OpenRouter and local Ollama). Its MCP tools are
internal to the app's own agents and node editor; there's no documented
"connect Claude Desktop to it" path in the free build.

The open build is AGPL-3.0 and free for personal use. The README pushes the
paid Enterprise edition hard; you don't need it.

---

## Installing AutoHedge (read this first)

```bash
pip install -U autohedge
```

Its `.env` needs `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`, `JUPITER_API_KEY`,
and `WALLET_PRIVATE_KEY`. **Leave `WALLET_PRIVATE_KEY` empty** unless you have
decided, with eyes open, to let an LLM pipeline spend from that wallet with
"minimal human intervention" — their words. There is no paper mode, no
drawdown cap you set, and no killzone or news filter. It is an execution
framework, not a learning tool.

If you want the *idea* from AutoHedge — several specialised agents debating a
trade — the closest thing in this bot is `npm run talk` with the assistant on:
it will argue with your plan, and it can't touch a wallet.

---

## What "installing into Claude" can mean, so you can ask for the right thing

1. **An MCP server** — a program Claude Desktop / Claude Code can call as tools.
   Vibe-Trading does this. This bot could too, if you want it: a small
   `mcp_server.ts` exposing `brief`, `analysis`, `replay` and `news` as tools
   would let you ask Claude "what's the bot's plan today?" from any chat. Say
   the word and I'll build it.
2. **Project knowledge** — files you upload to a Claude Project so Claude can
   read them. You can drop `README.md` and `trading_bot_instructions.md` from
   this bot into a Project today.
3. **Code in this repo** — vendoring another project's source here. Not
   appropriate for these three (size, licence, language, and — for AutoHedge —
   purpose).
