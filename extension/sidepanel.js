import { createLineParser, describeCitation, emptyTurn, reduceTurn, speakable } from './lib/stream.js'

/**
 * The side panel. A second client for the same assistant route the web dock
 * uses, with the same rules: nothing is stated that a tool did not return,
 * every answer carries its sources, and an action is only ever *proposed*
 * here — approving it goes through the same approval endpoint and the same
 * database function as the web app, so the panel adds no new way to act.
 *
 * Authentication is the app's own session cookie. Chrome sends it because
 * the person granted this extension access to that one address; the server
 * answers because the extension's origin is on its allowlist. Neither side
 * trusts the other by default.
 */

const el = {
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  workspace: document.getElementById('workspace'),
  speak: document.getElementById('speak'),
  gate: document.getElementById('gate'),
  gateText: document.getElementById('gate-text'),
  gateAction: document.getElementById('gate-action'),
  transcript: document.getElementById('transcript'),
  draft: document.getElementById('draft'),
  mic: document.getElementById('mic'),
  send: document.getElementById('send'),
  notice: document.getElementById('notice'),
}

const state = {
  appUrl: null,
  session: null,
  organizationId: null,
  threadId: null,
  busy: false,
  speakReplies: false,
  turns: [],
}

// ── Setup and sign-in gate ──────────────────────────────────────────────
function gate(text, action, onAction) {
  el.gateText.textContent = text
  el.gateAction.textContent = action
  el.gateAction.onclick = onAction
  el.gate.hidden = false
  el.draft.disabled = true
  el.send.disabled = true
  el.mic.disabled = true
}

function ungate() {
  el.gate.hidden = true
  el.draft.disabled = false
  el.send.disabled = false
  el.mic.disabled = false
}

function notice(text) {
  el.notice.textContent = text ?? ''
  el.notice.hidden = !text
}

async function loadSession() {
  const { appUrl } = await chrome.storage.local.get('appUrl')
  state.appUrl = appUrl ?? null
  if (!state.appUrl) {
    gate('Tell the extension where your Aurelis lives.', 'Open settings', () =>
      chrome.runtime.openOptionsPage(),
    )
    return
  }

  let response
  try {
    response = await fetch(`${state.appUrl}/api/session`, { credentials: 'include' })
  } catch {
    gate(
      'Aurelis did not answer. Either the address is wrong, or this extension’s origin is not on the server’s CLIENT_ORIGINS allowlist yet.',
      'Open settings',
      () => chrome.runtime.openOptionsPage(),
    )
    return
  }

  if (response.status === 401) {
    gate('Sign in to Aurelis in a tab, then come back here.', 'Sign in', () =>
      chrome.tabs.create({ url: `${state.appUrl}/login` }),
    )
    return
  }
  if (!response.ok) {
    gate(`Aurelis answered ${response.status}. Try again in a moment.`, 'Retry', loadSession)
    return
  }

  state.session = await response.json()
  el.title.textContent = state.session.assistantName ?? 'Aurelis'

  const memberships = state.session.memberships ?? []
  if (memberships.length === 0) {
    gate('Your account has no workspace yet. Finish onboarding in the app.', 'Open Aurelis', () =>
      chrome.tabs.create({ url: `${state.appUrl}/app/onboarding` }),
    )
    return
  }

  el.workspace.innerHTML = ''
  for (const m of memberships) {
    const option = document.createElement('option')
    option.value = m.organizationId
    option.textContent = m.isDemo ? `${m.name} (demo)` : m.name
    el.workspace.appendChild(option)
  }
  el.workspace.hidden = memberships.length < 2
  const { organizationId } = await chrome.storage.local.get('organizationId')
  const chosen = memberships.find((m) => m.organizationId === organizationId) ?? memberships[0]
  selectWorkspace(chosen.organizationId)
  ungate()
}

function selectWorkspace(organizationId) {
  const m = state.session.memberships.find((x) => x.organizationId === organizationId)
  if (!m) return
  state.organizationId = m.organizationId
  state.threadId = null
  state.turns = []
  render()
  el.workspace.value = m.organizationId
  el.subtitle.textContent = `${m.name} · ${m.currency}${m.isDemo ? ' · demonstration data' : ''}`
  chrome.storage.local.set({ organizationId: m.organizationId })
}

el.workspace.addEventListener('change', () => selectWorkspace(el.workspace.value))

// ── Asking ──────────────────────────────────────────────────────────────
async function ask(question, spoken) {
  const text = question.trim()
  if (!text || state.busy || !state.organizationId) return
  state.busy = true
  el.send.disabled = true
  notice(null)
  el.draft.value = ''
  autosize()

  const answer = emptyTurn(crypto.randomUUID())
  state.turns.push({ id: crypto.randomUUID(), role: 'user', text }, answer)
  render()

  const apply = (event) => {
    const index = state.turns.findIndex((t) => t.id === answer.id)
    if (index < 0) return
    state.turns[index] = reduceTurn(state.turns[index], event)
    if (event.type === 'thread') state.threadId = event.threadId
    render()
  }

  try {
    const response = await fetch(`${state.appUrl}/api/assistant`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: text,
        threadId: state.threadId ?? undefined,
        organizationId: state.organizationId,
        voice: spoken && state.speakReplies,
      }),
    })

    if (response.status === 401) {
      apply({ type: 'error', message: 'Your session has ended. Sign in again in a tab.' })
      gate('Sign in to Aurelis in a tab, then come back here.', 'Sign in', () =>
        chrome.tabs.create({ url: `${state.appUrl}/login` }),
      )
      return
    }
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null)
      apply({ type: 'error', message: payload?.error ?? `Aurelis answered ${response.status}.` })
      return
    }

    const parser = createLineParser(apply)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.flush()

    const finished = state.turns.find((t) => t.id === answer.id)
    if (finished && !finished.failed && state.speakReplies && finished.text) speak(finished.text)
  } catch {
    apply({ type: 'error', message: 'The connection dropped before the answer finished.' })
  } finally {
    state.busy = false
    el.send.disabled = false
  }
}

el.send.addEventListener('click', () => ask(el.draft.value, false))
el.draft.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    ask(el.draft.value, false)
  }
})
el.draft.addEventListener('input', autosize)

function autosize() {
  el.draft.style.height = 'auto'
  el.draft.style.height = `${Math.min(el.draft.scrollHeight, 128)}px`
}

// ── Approvals ───────────────────────────────────────────────────────────
async function decide(turnId, approvalId, approve) {
  const response = await fetch(`${state.appUrl}/api/assistant/approvals`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId, approve }),
  })
  const payload = await response.json().catch(() => null)
  const turn = state.turns.find((t) => t.id === turnId)
  if (!turn) return
  turn.approvals = turn.approvals.map((a) =>
    a.id !== approvalId
      ? a
      : {
          ...a,
          decision: !response.ok ? 'failed' : approve ? 'approved' : 'rejected',
          outcome: payload?.message ?? payload?.error ?? (response.ok ? 'Done.' : 'That could not be decided.'),
        },
  )
  render()
}

// ── Voice ───────────────────────────────────────────────────────────────
const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null
let recognition = null
let heard = ''

function startListening() {
  if (!Recognition) {
    notice('This browser cannot listen. Typing still works.')
    return
  }
  if (recognition || state.busy) return
  heard = ''
  recognition = new Recognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = navigator.language || 'en-US'
  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) heard += `${result[0].transcript} `
      else interim += result[0].transcript
    }
    el.draft.value = `${heard}${interim}`.trimStart()
    autosize()
  }
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed') {
      notice('Chrome needs microphone permission once. Grant it from the extension’s settings page.')
    } else if (event.error !== 'aborted') {
      notice(`Listening stopped: ${event.error}.`)
    }
  }
  recognition.onend = () => {
    recognition = null
    el.mic.classList.remove('listening')
    el.mic.textContent = 'Hold'
    const question = heard.trim()
    heard = ''
    if (question) ask(question, true)
  }
  recognition.start()
  el.mic.classList.add('listening')
  el.mic.textContent = 'Listening'
}

function stopListening() {
  recognition?.stop()
}

el.mic.addEventListener('mousedown', startListening)
el.mic.addEventListener('mouseup', stopListening)
el.mic.addEventListener('mouseleave', stopListening)
el.mic.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (!recognition) startListening()
    else stopListening()
  }
})

function speak(text) {
  if (!('speechSynthesis' in globalThis)) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(speakable(text))
  utterance.lang = navigator.language || 'en-US'
  speechSynthesis.speak(utterance)
}

el.speak.addEventListener('click', () => {
  state.speakReplies = !state.speakReplies
  el.speak.setAttribute('aria-pressed', String(state.speakReplies))
  el.speak.textContent = state.speakReplies ? 'Voice on' : 'Voice off'
  if (!state.speakReplies && 'speechSynthesis' in globalThis) speechSynthesis.cancel()
})

// ── Rendering ───────────────────────────────────────────────────────────
function render() {
  el.transcript.replaceChildren(...state.turns.map(renderTurn))
  el.transcript.scrollTo({ top: el.transcript.scrollHeight })
}

function renderTurn(turn) {
  if (turn.role === 'user') {
    const p = document.createElement('p')
    p.className = 'turn-user'
    p.textContent = turn.text
    return p
  }

  const root = document.createElement('div')
  root.className = `turn-assistant${turn.failed ? ' failed' : ''}`

  if (turn.tools.length > 0) {
    const ul = document.createElement('ul')
    ul.className = 'tools'
    for (const tool of turn.tools) {
      const li = document.createElement('li')
      li.textContent = `${tool.name.replaceAll('_', ' ')}${tool.ok === false ? ' failed' : ''}`
      if (tool.ok === false) li.className = 'failed'
      ul.appendChild(li)
    }
    root.appendChild(ul)
  }

  const text = document.createElement('p')
  text.className = 'text'
  text.textContent = turn.text || (turn.done ? '' : '…')
  root.appendChild(text)

  if (turn.citations.length > 0) {
    const ul = document.createElement('ul')
    ul.className = 'chips'
    ul.setAttribute('aria-label', 'Sources for this answer')
    for (const key of turn.citations) {
      const { label, href } = describeCitation(key, turn.sources)
      const li = document.createElement('li')
      li.title = label
      if (href) {
        const a = document.createElement('a')
        a.href = href
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = label
        li.appendChild(a)
      } else {
        li.textContent = label
      }
      ul.appendChild(li)
    }
    root.appendChild(ul)
  }

  for (const approval of turn.approvals) root.appendChild(renderApproval(turn.id, approval))
  return root
}

function renderApproval(turnId, approval) {
  const card = document.createElement('div')
  card.className = 'approval'

  const summary = document.createElement('p')
  summary.textContent = approval.summary
  card.appendChild(summary)

  if (Array.isArray(approval.fields) && approval.fields.length > 0) {
    const dl = document.createElement('dl')
    for (const field of approval.fields) {
      const dt = document.createElement('dt')
      dt.textContent = field.label
      const dd = document.createElement('dd')
      dd.textContent = field.value
      dl.append(dt, dd)
    }
    card.appendChild(dl)
  }

  if (approval.decision) {
    const p = document.createElement('p')
    p.className = 'decided'
    p.textContent = approval.outcome ?? approval.decision
    card.appendChild(p)
    return card
  }

  const actions = document.createElement('div')
  actions.className = 'actions'
  const yes = document.createElement('button')
  yes.className = 'primary'
  yes.textContent = 'Approve'
  yes.onclick = () => decide(turnId, approval.id, true)
  const no = document.createElement('button')
  no.className = 'toggle'
  no.textContent = 'Decline'
  no.onclick = () => decide(turnId, approval.id, false)
  actions.append(yes, no)
  card.appendChild(actions)

  const note = document.createElement('p')
  note.className = 'decided'
  note.textContent = 'Nothing happens until this is approved. Expires in a few minutes.'
  card.appendChild(note)
  return card
}

loadSession()
