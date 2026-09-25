# Publishing AURELIS

An honest readiness assessment and the steps for each real distribution path.
Read the verdict first; it will save you a rejected submission.

## Verdict

**Not ready for Apple's App Store, and Apple's App Store is not the right first
target.** Two separate reasons:

1. **iOS App Store — wrong technology.** AURELIS's app is an Electron desktop
   shell and a Chrome extension. Neither can ship on the iOS App Store; that
   would require a native or React Native rebuild, which is a separate project,
   not a packaging step.
2. **Mac App Store — possible but a poor fit, and not configured.** Electron
   apps *can* reach the Mac App Store, but it needs the Apple Developer Program,
   App Sandbox entitlements (the ones here are tuned for a directly-distributed,
   hardened-runtime build, not the MAS sandbox), and a provisioning profile.
   More importantly, a thin window onto a hosted web app is exactly what Apple
   rejects under guideline 4.2 ("minimum functionality"). The pragmatic Mac
   path is a **directly-downloaded, signed and notarized `.dmg`**, which the
   `Desktop app` workflow already produces.

**A deeper blocker sits under all of this: the product is not deployed yet.**
Every store review opens the app and expects it to work. An app pointing at a
backend that does not exist fails review immediately. Before any store, the web
app must be live on its own domain with a real Supabase project, and the
launch-checklist items that need a person must be done (see below).

## What you can actually publish, and how ready each is

| Target | What ships | Readiness | Needs from you |
| --- | --- | --- | --- |
| **Web app (Vercel)** | The product itself | Code ready; not deployed | A Vercel project, a Supabase project, env vars, a domain |
| **Chrome Web Store** | The browser extension | Code ready; listing drafted below | A $5 developer account, screenshots, the final upload |
| **Direct-download desktop** | Signed `.dmg` / `.exe` / `.AppImage` | Build workflow ready | Code-signing certificates (Apple + Windows) |
| **Mac App Store** | The desktop app, re-fitted | Not configured; not recommended first | Apple Developer Program, sandbox rework, likely a 4.2 fight |
| **iOS App Store** | — | Not applicable | A native rebuild (separate project) |

The realistic launch is: **deploy the web app, list the extension on the Chrome
Web Store, and offer the signed desktop app as a direct download.** That reaches
every platform without an App Store review, and it is achievable now.

## Prerequisites, common to every path

These are the launch-checklist items no code can close. A store reviewer, or
your first real customer, will hit them:

- A real Supabase project and the web app deployed to its own domain.
- The legal pages finalized and reachable (`/legal/privacy`, `/legal/terms`) —
  the Chrome Web Store and Apple both require a privacy-policy URL.
- Mail authentication (SPF/DKIM/DMARC) on the sending domain, or briefing and
  alert emails land in spam.
- A KMS behind the credential vault, an outside security review, and a restore
  rehearsal.

## Chrome Web Store — the achievable store

The extension is manifest-v3, side-panel based, and asks for only `sidePanel`
and `storage` by default; host access is an *optional* permission the person
grants to their own deployment. That is a clean review story.

### Package it

From the repository root, build a zip that excludes the dev-only scripts:

```bash
cd extension
zip -r ../dist/aurelis-extension.zip . -x 'scripts/*'
```

### Listing copy (draft — edit to taste)

- **Name:** Aurelis
- **Summary (132 chars max):** Talk to your business. Ask about revenue, profit, ad spend, pipeline and notes — by voice or text — in a side panel.
- **Category:** Productivity
- **Privacy policy URL:** `https://<your-domain>/legal/privacy`
- **Single purpose:** A side-panel client for the user's own Aurelis
  deployment: it asks the assistant questions and shows the answers.
- **Permission justifications:**
  - `sidePanel` — the entire UI is a side panel.
  - `storage` — remembers the address of the user's Aurelis deployment and
    their workspace choice; nothing else.
  - optional host permission — granted by the user, to reach only the one
    deployment address they enter on the options page.
- **Data use disclosure:** The extension collects no analytics and sends no
  data anywhere except the user's own configured deployment, using their
  existing signed-in session. State the same in the store's data-use form.

### What you still have to supply

A developer account ($5 one-time), at least one 1280×800 screenshot (run the
app and capture the side panel), and a 128px store icon (a real logo — the
generated placeholder in `extension/icons` works but a designed mark is better).

## Direct-download desktop — the achievable desktop path

Already documented in `desktop/README.md`. In short: tag `desktop-v1.0.0`, the
workflow builds all three installers and attaches them to a GitHub release. Add
the signing secrets first (`CSC_LINK`, `CSC_KEY_PASSWORD`, and the Apple
notarization trio) or every OS warns on first launch, which costs installs.

## Web app on Vercel

Create a Vercel project from this branch, set the environment variables from
`.env.example` (Supabase URL and keys, `NEXT_PUBLIC_SITE_URL`, the vault master
key, `CLIENT_ORIGINS` for the extension, and any connectors), and deploy. This
is the backend the extension and desktop app both point at, so it comes first.

## Recommended order

1. Deploy the web app to a real domain with a real Supabase project.
2. Finalize and host the legal pages; wire mail authentication.
3. List the extension on the Chrome Web Store.
4. Sign and release the desktop installers as a direct download.
5. Only then, if you still want it, take on the Mac App Store re-fit.
