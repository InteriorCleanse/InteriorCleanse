// Owner only: members and their access codes, and the Stripe hook-up notes.
import { getJson, postJson, del, esc, when } from './api.js'
import { toast, loading, errorStrip } from './ui.js'

export async function render(el, ctx) {
  if (ctx.me.role !== 'owner') { el.innerHTML = errorStrip('Only the owner can see this.'); return }
  el.innerHTML = `<div class="head"><div><h1>Members</h1><p>Who can sign in. Add a member by email and send them the code it shows once.</p></div></div>${loading('Loading…')}`
  let members
  try { members = await getJson('/api/admin/members') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const origin = location.origin
  el.innerHTML = `<div class="head"><div><h1>Members</h1><p>Who can sign in. Add a member by email and send them the code it shows once.</p></div></div>
    <div class="panel"><h2>Add a member</h2><form id="m-form" class="row"><input type="email" name="email" placeholder="name@example.com" required style="flex:1;min-width:220px" aria-label="Member email" /><button class="btn" type="submit">Add and make a code</button></form><div id="m-new"></div></div>
    <div class="panel"><h2>Members (${members.length})</h2>${members.length ? `<table class="members"><thead><tr><th>Email</th><th>Code</th><th>Active</th><th class="wide">From</th><th class="wide">Since</th><th></th></tr></thead><tbody>${members.map((m) => `<tr data-email="${esc(m.email)}"><td>${esc(m.email)}</td><td class="mono">…${esc(m.codeLast4)}</td><td>${m.active ? '<span class="pill go">Active</span>' : '<span class="pill hot">Off</span>'}</td><td class="wide">${esc(m.source)}</td><td class="mono wide">${esc(when(m.createdAt))}</td><td><div class="row"><button class="btn outline sm" type="button" data-recode>New code</button><button class="btn outline sm" type="button" data-remove>Remove</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="dim">No members yet. Codes set in GAVEL_MEMBER_CODES also work, for any email.</p>'}</div>
    <div class="panel"><h2>Stripe subscriptions</h2>
      <p>To let Stripe manage members: create a subscription product and a Payment Link or Checkout in Stripe, then add a webhook endpoint pointing at</p>
      <p><code>${esc(origin)}/api/stripe/webhook</code></p>
      <p>with the events <code>checkout.session.completed</code>, <code>customer.subscription.updated</code> and <code>customer.subscription.deleted</code>. Paste the endpoint's signing secret into the server's environment as <code>GAVEL_STRIPE_WEBHOOK_SECRET</code> (never into the code). A paid checkout creates the member; you then issue their code here with <b>New code</b> and send it to them. A cancelled or unpaid subscription switches them off.</p>
      <p class="dim" style="font-size:14px">Gavel does not send email. You send the code.</p></div>`
  const showCode = (made) => {
    const invite = inviteText(origin, made.member.email, made.code)
    el.querySelector('#m-new').innerHTML = `<div class="strip go" style="margin-top:12px"><b>${esc(made.member.email)}</b> — access code: <code style="font-size:18px">${esc(made.code)}</code>
      <div class="row" style="margin-top:8px"><button class="btn sm" type="button" id="m-invite">Copy invite</button><button class="btn outline sm" type="button" id="m-copy">Copy code only</button></div>
      <div style="margin-top:6px">Send it to them now: the code will not be shown again. The invite says where to go and what to type.</div>
      <pre class="invite">${esc(invite)}</pre></div>`
    const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a text or an email.') } catch { toast('Select the text and copy it.', 'hot') } }
    el.querySelector('#m-invite').addEventListener('click', () => copy(invite))
    el.querySelector('#m-copy').addEventListener('click', () => copy(made.code))
  }
  el.querySelector('#m-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = String(new FormData(e.target).get('email') || '')
    try { const made = await postJson('/api/admin/members', { email }); showCode(made); setTimeout(() => render(el, ctx).then(() => showCode(made)), 0) } catch (err) { toast(err.message, 'hot') }
  })
  el.querySelectorAll('[data-recode]').forEach((b) => b.addEventListener('click', async () => {
    const email = b.closest('tr').dataset.email
    try { const made = await postJson('/api/admin/members', { email }); showCode(made) } catch (err) { toast(err.message, 'hot') }
  }))
  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const email = b.closest('tr').dataset.email
    if (!window.confirm(`Remove ${email}? They will not be able to sign in.`)) return
    try { await del('/api/admin/members/' + encodeURIComponent(email)); render(el, ctx) } catch (err) { toast(err.message, 'hot') }
  }))
}

/** The message the owner sends a new member: where to go, which tab, what to type. */
export function inviteText(origin, email, code) {
  return [
    'You are in. Here is how to sign in to Gavel:',
    '',
    `1. Open ${origin}/login`,
    '2. Choose Member.',
    `3. Email: ${email}`,
    `4. Access code: ${code}`,
    '',
    'Keep the code private: it works like a password. On a phone, add Gavel to your home screen and it opens like an app.',
  ].join('\n')
}
