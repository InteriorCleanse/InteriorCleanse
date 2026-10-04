// Coach: the day-to-day business coach. Today's three, the first-car journey with
// what to look for, and a conversation. With an Anthropic key the coach is Claude
// with web search, page reading and Gavel's tools (src/coach/agent.ts); without
// one it answers from the journey and the books (src/coach/rules.ts) and says so.
import { getJson, postJson, esc, safeUrl } from './api.js'
import { toast, loading, errorStrip } from './ui.js'

const KIND_ICON = { search: '⌕', read: '↗', tool: '◆' }
let busy = false

/** A small, safe Markdown: escape first, then bold, links, lists and paragraphs. */
function md(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)} ↗</a>`)
    .replace(/(^|[\s(])(#(?:deals|feed|plan\/[\w%:.-]+|business|parts|auctions|coach|watch|settings|setup|playbook(?:\/[\w-]+)?|intel|import|sniper|rental))\b/g, '$1<a href="$2">$2</a>')
  const out = []
  let list = null
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd()
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s/.test(line)
    if (li) {
      if (!list || list.ordered !== ordered) { if (list) out.push(list.ordered ? '</ol>' : '</ul>'); out.push(ordered ? '<ol>' : '<ul>'); list = { ordered } }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }
    if (list) { out.push(list.ordered ? '</ol>' : '</ul>'); list = null }
    if (!line.trim()) continue
    const h = /^#{1,4}\s+(.*)$/.exec(line)
    out.push(h ? `<p class="c-h">${inline(h[1])}</p>` : `<p>${inline(line)}</p>`)
  }
  if (list) out.push(list.ordered ? '</ol>' : '</ul>')
  return out.join('')
}

function msgHtml(m) {
  if (m.role === 'user') return `<div class="cmsg me"><div class="bubble">${esc(m.text)}</div></div>`
  const acts = m.activity || []
  const cites = (m.citations || []).filter((c) => safeUrl(c.url))
  return `<div class="cmsg coach"><span class="cavatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/></svg></span><div class="bubble">
    ${acts.length ? `<details class="cact"><summary class="mono">${acts.length} step${acts.length === 1 ? '' : 's'}: ${esc([...new Set(acts.map((a) => a.kind === 'search' ? 'web search' : a.kind === 'read' ? 'read pages' : 'Gavel tools'))].join(' · '))}</summary><ul>${acts.map((a) => `<li><span aria-hidden="true">${KIND_ICON[a.kind] || '·'}</span> ${esc(a.label)}</li>`).join('')}</ul></details>` : ''}
    <div class="ctext">${md(m.text)}</div>
    ${cites.length ? `<div class="ccite"><span class="mono dim">Sources</span>${cites.slice(0, 8).map((c, i) => `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><span class="mono">${i + 1}</span>${esc((c.title || c.url).slice(0, 70))}</a>`).join('')}</div>` : ''}
    ${m.source === 'rules' ? '<p class="mono dim csrc">Answered from your books and Gavel\'s journey. Turn on AI for web research and any question.</p>' : ''}
  </div></div>`
}

function greeting(c) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const next = c.journey.find((j) => !j.done)
  return { role: 'coach', text: `${part}. You are at **${c.stage.name}** (stage ${c.stage.n} of ${c.stage.of}).${next ? `\n\nYour next step is **${next.title}**. ${next.why}` : '\n\nEvery step of the first-car journey is done. Now we grow it.'}\n\nAsk me anything: where to buy, what to look for on a car, what to bid, or what to do today.`, source: c.ai.available ? 'ai' : undefined }
}

function journeyHtml(c) {
  const nextIdx = c.journey.findIndex((j) => !j.done)
  return `<ol class="jsteps">${c.journey.map((j, i) => {
    const state = j.done ? 'done' : i === nextIdx ? 'next' : 'later'
    return `<li class="jstep ${state}" data-step="${esc(j.id)}"><details ${i === nextIdx ? 'open' : ''}><summary><span class="jn">${j.done ? '✓' : j.n}</span><span class="jt"><b>${esc(j.title)}</b><span class="mono dim">${j.done ? (j.by === 'gavel' ? 'done · Gavel can see it' : 'done · you ticked it') : i === nextIdx ? 'next' : ''}</span></span></summary>
      <div class="jbody"><p>${esc(j.why)}</p><ul>${j.do.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
        ${j.id === 'check' ? `<div class="lookfor">${c.lookFor.map((g) => `<div><h4 class="mono">${esc(g.group)}</h4><ul>${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
        <div class="row"><a class="btn sm" href="${esc(j.href)}">${esc(j.action)}</a><button class="btn outline sm" type="button" data-ask="${esc(j.ask)}">Ask the coach</button>${j.by !== 'gavel' ? `<button class="more" type="button" data-tick-step="${esc(j.id)}" data-done="${!j.done}">${j.done ? 'Not done yet' : 'Mark done'}</button>` : ''}</div></div></details></li>`
  }).join('')}</ol>`
}

function todayHtml(c) {
  return `<div class="today-list">${c.today.tasks.map((t) => `<label class="ttask ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''} /><span><b>${esc(t.title)}</b><span class="dim">${esc(t.why)}</span></span><a class="more" href="${esc(t.href)}">open</a></label>`).join('')}</div>`
}

export async function render(el, ctx, args = []) {
  el.innerHTML = `<div class="head"><div><h1>Coach</h1></div></div>${loading('Getting your day ready…')}`
  let c
  try { c = await getJson('/api/coach') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const pct = Math.round((c.journey.filter((j) => j.done).length / c.journey.length) * 100)
  const msgs = c.thread && c.thread.display.length ? c.thread.display : [greeting(c)]
  const next = c.journey.find((j) => !j.done)
  const prompts = [next && next.ask, 'What should I look for before I bid on a car?', 'Which auctions can I buy at, and which first?', ctx.me.cashUsd ? `Find me the best deals for $${Number(ctx.me.cashUsd).toLocaleString('en-US')}` : 'Find me good deals for my budget', 'Plan my day'].filter(Boolean)
  el.innerHTML = `<div class="head"><div><h1>Coach</h1><p>Your day-to-day coach: where to buy, what to look for, what to bid, and what to do today.</p></div>
      <div class="stage-chip" title="${pct}% of the first-car journey done"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" pathLength="100" class="ring-bg"/><circle cx="18" cy="18" r="15" pathLength="100" class="ring" style="stroke-dasharray:${pct} 100"/></svg><span><span class="mono dim">Stage ${c.stage.n} of ${c.stage.of}</span><b>${esc(c.stage.name)}</b></span></div></div>
    <div class="coach-grid">
      <section class="panel chat" aria-label="Talk to your coach">
        <div class="chat-top"><span class="mono dim">${c.ai.available ? 'AI coach · web search · Gavel tools' : 'Coach · from your books and the journey'}</span><button class="more" type="button" id="c-new">New conversation</button></div>
        <div class="cmsgs" id="c-msgs" aria-live="polite">${msgs.map(msgHtml).join('')}</div>
        <div class="cprompts chips wrap">${prompts.slice(0, 5).map((p) => `<button type="button" class="chip" data-ask="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        <form class="ccompose" id="c-form"><label class="sr-only" for="c-q">Ask your coach</label><textarea id="c-q" rows="1" maxlength="2000" placeholder="Ask anything: a car, an auction, a price, your next step…"></textarea><button class="btn" type="submit" id="c-send">Send</button></form>
        ${c.ai.available ? '' : `<p class="mono dim csrc">${esc(c.ai.reason)}</p>`}
      </section>
      <aside class="coach-side">
        <section class="panel today"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Today's three</h2><span class="streak mono" id="c-streak">${c.today.streak ? `${c.today.streak}-day streak` : 'start a streak'}</span></div>${todayHtml(c)}</section>
        <section class="panel journey"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>Your first auction car</h2><span class="mono dim">${pct}%</span></div><div class="jbar"><i style="--w:${pct}%"></i></div>${journeyHtml(c)}</section>
      </aside>
    </div>`

  const list = el.querySelector('#c-msgs')
  const box = el.querySelector('#c-q')
  const scrollEnd = () => { list.scrollTop = list.scrollHeight }
  scrollEnd()
  const grow = () => { box.style.height = 'auto'; box.style.height = Math.min(160, box.scrollHeight) + 'px' }
  box.addEventListener('input', grow)
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('#c-form').requestSubmit() } })

  const listingId = args[0] === 'car' && args[1] ? args[1] : ''
  async function ask(q) {
    if (busy || !q.trim()) return
    busy = true
    el.querySelector('#c-send').disabled = true
    if (!c.thread || !c.thread.display.length) list.innerHTML = ''
    list.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', text: q }))
    const started = Date.now()
    list.insertAdjacentHTML('beforeend', `<div class="cmsg coach working" id="c-working"><span class="cavatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/></svg></span><div class="bubble"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="mono dim" id="c-elapsed">${c.ai.available ? 'Thinking. It may search the web and check the auctions.' : 'Reading your books…'}</span></div></div>`)
    scrollEnd()
    const tick = setInterval(() => { const n = document.getElementById('c-elapsed'); if (n && c.ai.available) n.textContent = `Working · ${Math.round((Date.now() - started) / 1000)}s. Research takes a minute when it searches the web.` }, 1000)
    box.value = ''; grow()
    try {
      const r = await postJson('/api/coach/ask', { question: q, listingId: listingId || undefined })
      document.getElementById('c-working')?.remove()
      list.insertAdjacentHTML('beforeend', msgHtml(r.reply))
      c.thread = c.thread || { display: [] }
      c.thread.display.push({ role: 'user', text: q }, r.reply)
    } catch (e) {
      document.getElementById('c-working')?.remove()
      list.insertAdjacentHTML('beforeend', `<div class="cmsg coach"><div class="bubble">${errorStrip(e.message)}</div></div>`)
    } finally {
      clearInterval(tick); busy = false; el.querySelector('#c-send').disabled = false; scrollEnd()
    }
  }
  el.querySelector('#c-form').addEventListener('submit', (e) => { e.preventDefault(); ask(box.value) })
  el.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => { el.querySelector('.chat').scrollIntoView({ behavior: 'smooth', block: 'start' }); ask(b.dataset.ask) }))
  el.querySelector('#c-new').addEventListener('click', async () => { try { await postJson('/api/coach/new', {}); render(el, ctx) } catch (e) { toast(e.message, 'hot') } })
  el.querySelectorAll('[data-task]').forEach((x) => x.addEventListener('change', async () => {
    x.closest('.ttask').classList.toggle('done', x.checked)
    try { const r = await postJson('/api/coach/tick', { kind: 'task', id: x.dataset.task, done: x.checked }); el.querySelector('#c-streak').textContent = r.streak ? `${r.streak}-day streak` : 'start a streak'; if (x.checked && el.querySelectorAll('[data-task]:checked').length === el.querySelectorAll('[data-task]').length) toast('All three done today. That is how it compounds.') } catch (e) { toast(e.message, 'hot') }
  }))
  el.querySelectorAll('[data-tick-step]').forEach((b) => b.addEventListener('click', async () => {
    try { await postJson('/api/coach/tick', { kind: 'step', id: b.dataset.tickStep, done: b.dataset.done === 'true' }); render(el, ctx) } catch (e) { toast(e.message, 'hot') }
  }))
  // Arriving from a car ("Ask the coach about this car"), the question is ready to send.
  if (listingId && args[2]) { box.value = args[2]; grow(); box.focus() }
}
