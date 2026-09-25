/**
 * Aurelis for the desktop: a tray app around the web product.
 *
 * Deliberately thin. The app owns no data and no credentials; it loads the
 * same site a browser would, in its own window, and the session cookie lives
 * in Electron's own cookie store for this app alone. That is the whole
 * security model: whatever the web app enforces, this enforces, because it
 * *is* the web app. What the shell adds is a place in the menu bar, a global
 * shortcut, a microphone permission for the voice dock, and nothing else.
 *
 * Everything the renderer could ask for is refused by default: no Node in the
 * page, context isolation on, sandbox on, navigation held to the app's own
 * origin, every other link handed to the system browser.
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, shell, nativeImage, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SHORTCUT = 'CommandOrControl+Shift+Space'
const WINDOW = { width: 440, height: 760 }

let tray = null
let win = null
let quitting = false

// ── Where the app lives ─────────────────────────────────────────────────
// Precedence: environment (developers), settings.json in the user data
// directory (a person who was told a different address), the address baked
// into package.json at build time (everyone else).
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

function appUrl() {
  const fromEnv = process.env.AURELIS_APP_URL
  const fromSettings = readSettings().appUrl
  const fromPackage = require('./package.json').aurelis?.appUrl
  const candidate = fromEnv || fromSettings || fromPackage
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('insecure')
    return url.origin
  } catch {
    return null
  }
}

function sameOrigin(target) {
  const origin = appUrl()
  try {
    return origin !== null && new URL(target).origin === origin
  } catch {
    return false
  }
}

// ── Window ──────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    ...WINDOW,
    show: false,
    title: 'Aurelis',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Off deliberately: Chromium's spellchecker can fetch Hunspell
      // dictionaries from a Google CDN on first use, which is an outbound call
      // this app otherwise never makes. Keeping it off means the shell talks to
      // nothing but the deployment you configure.
      spellcheck: false,
      // webSecurity stays on (the default); this app never disables it.
    },
  })

  // Links to anywhere but the app open in the person's browser; the window
  // never becomes a general-purpose browser, and no other site ever runs in
  // a context that carries the app's cookies.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!sameOrigin(url)) shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!sameOrigin(url)) {
      event.preventDefault()
      shell.openExternal(url).catch(() => {})
    }
  })

  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })

  const origin = appUrl()
  if (origin) win.loadURL(`${origin}/app/command-center`)
  else win.loadURL(`data:text/html,${encodeURIComponent(unconfiguredPage())}`)
}

function unconfiguredPage() {
  return `<!doctype html><meta charset="utf-8"><title>Aurelis</title>
  <body style="font:15px system-ui;padding:32px;color:#222;background:#f6f6f4">
  <h1 style="font-size:18px">No Aurelis address is set</h1>
  <p>Set <code>AURELIS_APP_URL</code>, or write <code>{"appUrl":"https://…"}</code> to<br><code>${settingsPath()}</code> and restart.</p></body>`
}

function toggle() {
  if (!win) createWindow()
  if (win.isVisible() && win.isFocused()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

// ── Tray ────────────────────────────────────────────────────────────────
function trayIcon() {
  // macOS wants a template image (black + alpha) so it recolours for the
  // menu bar's light and dark modes; the others take the colour icon.
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', file))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function buildMenu() {
  const loginItem = app.getLoginItemSettings()
  return Menu.buildFromTemplate([
    { label: `Open Aurelis  (${SHORTCUT.replace('CommandOrControl', process.platform === 'darwin' ? '⌘' : 'Ctrl')})`, click: () => toggle() },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: loginItem.openAtLogin,
      enabled: process.platform !== 'linux',
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    {
      label: 'Sign out of this device',
      click: async () => {
        await session.defaultSession.clearStorageData()
        if (win) win.loadURL(`${appUrl()}/login`)
      },
    },
    { type: 'separator' },
    { label: `Address: ${appUrl() ?? 'not set'}`, enabled: false },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ])
}

function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip('Aurelis')
  tray.setContextMenu(buildMenu())
  tray.on('click', () => toggle())
}

// ── Lifecycle ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => toggle())

  app.whenReady().then(() => {
    // The voice dock needs the microphone and nothing else. Every other
    // permission request — notifications, geolocation, clipboard — is
    // refused, and even the microphone only for the app's own origin.
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      const allowed = permission === 'media' && sameOrigin(contents.getURL())
      callback(allowed)
    })
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) =>
      permission === 'media' && sameOrigin(origin),
    )

    if (process.platform === 'darwin') app.dock?.hide()
    createTray()
    createWindow()
    if (!globalShortcut.register(SHORTCUT, toggle)) {
      // Another app holds the shortcut; the tray still works.
      tray.setToolTip('Aurelis (shortcut unavailable)')
    }
  })

  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', (event) => { if (event) event.preventDefault?.() })
}

module.exports = { appUrl, sameOrigin, writeSettings }
