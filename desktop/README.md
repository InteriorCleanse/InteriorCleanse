# Aurelis for the desktop

A downloadable PC app for Windows, macOS, and Linux. It is a thin, hardened
window onto your own Aurelis deployment — it holds no data and no business
logic of its own. This document says how to build the installer and, just as
importantly, exactly what the app does and does not do with your information.

## Get the downloadable installer

You do not build this by hand for release. The `Desktop app` GitHub Actions
workflow builds all three platforms and attaches the installers to a GitHub
release.

1. Set the address the app should open. Either edit `aurelis.appUrl` in
   `desktop/package.json`, or pass it to the workflow's `app_url` input when
   you run it.
2. Tag a release: `git tag desktop-v1.0.0 && git push origin desktop-v1.0.0`.
   The workflow builds `Aurelis-<version>-win-x64.exe`, the macOS `.dmg`
   (Apple Silicon and Intel), and the Linux `.AppImage`, and attaches them to
   the release. Those files are the downloadable PC app.

To build one locally instead: `cd desktop && npm install && npm run dist`.

### Signing (do this before you distribute it)

Unsigned builds run, but Windows SmartScreen and macOS Gatekeeper warn on
first launch. Add these repository secrets and the same workflow signs and
notarises automatically: `CSC_LINK` and `CSC_KEY_PASSWORD` (a code-signing
certificate), and for macOS notarisation `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

## What the app does with your information — the short version

**Nothing leaves the app except to the one deployment you point it at.** Your
data lives in your own Supabase project, behind your own authentication, and
the desktop app is only a window to it. The app collects nothing, phones home
to no one, and has no ability to send your data anywhere else.

## The privacy and "no backdoor" posture, in detail

Every claim here is something you can verify in the source — see the next
section.

- **No telemetry, analytics, crash reporting, or tracking.** There is none in
  the desktop shell and none in the product it displays. Nothing counts your
  clicks or reports your usage.
- **No auto-updater.** The app never checks a remote server for updates, which
  means no channel exists through which new code could arrive silently. You
  update by downloading a new signed release yourself.
- **No outbound calls of its own.** The shell contains no `fetch`, no HTTP
  client, no network code. It loads the deployment URL you configured and
  nothing else.
- **The window is locked to your deployment.** Any link to another origin
  opens in your system browser instead, so no third-party page ever runs
  inside the app or sees its session cookies.
- **Least privilege.** Context isolation is on, Node integration is off, the
  renderer is sandboxed, and `webSecurity` is never disabled. Every device
  permission request — camera, location, clipboard — is refused, except the
  microphone, and only for your own deployment's origin, for the voice dock.
- **Spellcheck is off** so Chromium never fetches a dictionary from a CDN. In
  normal use the app is silent on the network apart from your deployment.
- **The installer bundles only the shell** (`main.js`, `assets`,
  `package.json`). It does not contain the `.claude/` build-assistant skills,
  the `.mcp.json` connections, or any third-party agent tooling. Those are
  development aids in the repository; they are never shipped to a user and are
  not part of the running app.

## How to verify it yourself — trust nothing, check everything

The whole app is auditable. To confirm the claims above:

```bash
# The shell is one small file. Read it end to end:
cat desktop/main.js

# Prove it makes no outbound calls and has no updater or telemetry:
grep -nE "fetch|autoUpdater|http\.|https\.|net\.|telemetry|analytics" desktop/main.js
#   -> no matches

# Prove the installer bundles only the shell, not the vendored skills:
node -e "console.log(require('./desktop/package.json').build.files)"
#   -> ["main.js","assets/**/*","package.json"]

# Build it from source and compare — the build is reproducible from this repo:
cd desktop && npm install && npm run dist
```

Because the source is here and the build comes only from it, there is no path
for code you did not review to end up in the app.

## What the app is not

- **It is not an offline, standalone program.** Aurelis is a hosted product:
  the server logic and the database are your Supabase and your web deployment.
  The desktop app is a client to that private backend, so it needs your
  deployment reachable (or `localhost` during development). This is a feature
  for privacy — your data stays in your infrastructure, not shipped inside a
  binary handed to others.

## The honest limit on "no backdoors"

I can show you, line by line, that this code contains no telemetry, no
updater, and no hidden outbound calls, and that the installer is built only
from this repository. That is a strong, checkable statement, and everything
above backs it. What it is not is a substitute for an independent security
audit: a true, third-party guarantee that the whole system — the web app, the
database rules, the dependencies — has no exploitable path is a review by
security professionals, which remains an open item on the launch checklist. I
will not overstate it. What I can attest to, I have made verifiable here.
