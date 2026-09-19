# Clients: the browser extension and the desktop app

Two more ways into the same product. Neither holds data, credentials or
logic of its own; both are windows onto the deployed web app, which is where
every rule is enforced. That is the design, not a shortcut: a client with its
own copy of the business rules is a client that will one day disagree with
the dashboard.

| | Browser extension | Desktop app |
| --- | --- | --- |
| What it is | Chrome side panel with the assistant, voice in and out | Tray / menu-bar app with a global shortcut that opens the web app |
| Where | `extension/` | `desktop/` |
| Talks to | `/api/session`, `/api/assistant`, `/api/assistant/approvals` | The whole app, in an Electron window |
| Signs in with | The app's own session cookie, sent by Chrome to the one address the person granted | The app's own login page, in a cookie store that belongs to this app alone |
| Needs on the server | The extension's origin in `CLIENT_ORIGINS` | Nothing |
| Ships as | A folder loaded unpacked, or a `.zip` for the Chrome Web Store | `.dmg`, `.exe`, `.AppImage` from the `Desktop app` workflow |

## Browser extension

### How it authenticates

The extension never sees a password or a token. It asks Chrome for
permission to reach one address — the deployment the person typed in — and
Chrome then attaches that site's session cookie to the extension's requests,
exactly as it would for a tab. If the person is signed out in the tab, the
panel says so and sends them to the login page.

The server side is the other half. A credentialed cross-origin request is
what cross-site request forgery is, so the app refuses them by default. The
middleware adds CORS headers only for origins listed, exact-match, in the
`CLIENT_ORIGINS` environment variable, and only on the three routes above.
There is no wildcard: with credentials the browser would reject one anyway,
and an allowlist that could be `*` is an allowlist someone will set to `*`.
Every other origin gets a response the browser refuses to hand over.

Workspace choice is a hint, never a scope: the assistant route matches the
organization id against the session's memberships and discards it if absent,
same as the web dock.

### Install for development

1. `chrome://extensions` → Developer mode → Load unpacked → the `extension/` folder.
2. Open the extension's options page. Enter the app's address and grant
   access. The page shows the value to add to `CLIENT_ORIGINS`:
   `chrome-extension://<32 letters>`. Add it in Vercel and redeploy.
3. Grant microphone access once from the same page. Chrome will not prompt
   from inside a side panel.
4. Open the panel from the toolbar button or `Ctrl+Shift+Space`
   (`⌘⇧Space` on a Mac).

The unpacked id changes if the folder moves. For a stable id, pack once and
keep the generated key, or publish to the Web Store, which assigns one.

### Publishing

`zip -r aurelis-extension.zip extension -x 'extension/scripts/*'` and upload
to the Chrome Web Store developer dashboard. The listing needs the reason
for each permission; the honest ones are: `sidePanel` for the panel,
`storage` for the app address, optional host permission for the one address
the person grants. There are no content scripts and nothing runs on other
sites.

### What is deliberately not there

- No API keys. The extension cannot be given one; there is no field for it.
- No content scripts. It reads nothing from the pages a person visits.
- No background fetches. The service worker opens the panel and stops.
- No second approval path. Approving an action calls the same endpoint,
  which calls the same database function, as the web dock.

## Desktop app

### What it is

An Electron shell around the web app: a tray icon, a global shortcut, a
window that loads `/app/command-center`, and a microphone permission for the
voice dock. `contextIsolation` on, `nodeIntegration` off, sandbox on. The
window will not navigate anywhere but the app's own origin; every other link
opens in the system browser, so no third-party page ever runs with the app's
cookies. Every permission request except the microphone, and even that for
any origin but the app's, is refused.

The address is baked in at build time (`aurelis.appUrl` in
`desktop/package.json`), and can be overridden by `AURELIS_APP_URL` or by a
`settings.json` in the app's user-data folder. Only `https` is accepted,
with `localhost` allowed for development.

### Build

Locally: `cd desktop && npm install && npm start` to run, `npm run dist` to
build for the current platform.

In CI: the `Desktop app` workflow builds all three platforms and, on a
`desktop-v*` tag, attaches the installers to a GitHub release. Run it by hand
with an `app_url` input to bake a different address.

### Signing, which you will want before selling it

Unsigned builds run, but macOS Gatekeeper and Windows SmartScreen both warn
on first launch, and that warning costs sales. Add these repository secrets
and the same workflow signs and notarises:

| Secret | For |
| --- | --- |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | A base64 `.p12` — Apple Developer ID Application, or a Windows code-signing certificate |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarisation |

An Apple Developer account is $99 a year. A Windows certificate is a few
hundred a year from a certificate authority, or free through the Microsoft
Store. Neither can be done from here.

## Selling it

Both clients are free to distribute; the product is the subscription behind
them. A person who installs either needs an account on your deployment, and
their plan and role decide what they can see and do, exactly as in a browser.
Nothing about billing lives in the clients, and nothing needs to.

## What is not done

- Auto-update for the desktop app. `electron-updater` against the GitHub
  releases the workflow already publishes is the usual route; it needs signed
  builds first.
- Firefox and Safari. The extension uses Chrome's side panel API. Firefox has
  a sidebar API with a different manifest key; Safari needs Xcode packaging.
- Push notifications to the clients. Briefings and alerts still arrive by
  email, Slack and Notion, and in the app.
