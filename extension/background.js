/**
 * Service worker. Deliberately tiny: it opens the side panel and nothing else.
 * No fetches, no storage of anything but the app URL, no content scripts on
 * anyone's pages.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-panel') return
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab?.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  }
})
