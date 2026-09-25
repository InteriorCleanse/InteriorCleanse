const input = document.getElementById('app-url')
const status = document.getElementById('status')
const originEl = document.getElementById('origin')

originEl.textContent = `chrome-extension://${chrome.runtime.id}`

chrome.storage.local.get('appUrl').then(({ appUrl }) => {
  if (appUrl) input.value = appUrl
})

/** Reduces whatever was typed to an origin, or null. */
function originOf(value) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const origin = originOf(input.value)
  if (!origin) {
    status.textContent = 'Enter the full https address of your Aurelis deployment.'
    return
  }
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
  if (!granted) {
    status.textContent = 'Chrome did not grant access to that address. Nothing was saved.'
    return
  }
  await chrome.storage.local.set({ appUrl: origin })
  input.value = origin
  status.textContent = 'Saved. Open the side panel with the toolbar button or Ctrl+Shift+Space.'
})

document.getElementById('mic').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    status.textContent = 'Microphone access granted. The side panel can listen now.'
  } catch {
    status.textContent = 'Microphone access was refused. Voice input stays off; typing still works.'
  }
})
