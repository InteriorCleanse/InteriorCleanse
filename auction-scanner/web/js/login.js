// The door. Member: email + access code. Owner: PIN. Both post JSON to /api/login.
const tabs = { member: document.getElementById('tab-member'), owner: document.getElementById('tab-owner') }
const forms = { member: document.getElementById('form-member'), owner: document.getElementById('form-owner') }
const err = document.getElementById('err')

// Where to go after signing in. The Send to Gavel button arrives as /#import/…;
// the redirect to /login keeps that hash, and this carries it on.
const back = '/' + (location.hash.startsWith('#') ? location.hash : '')

// Opened from an auction's site, the browser holds back the session cookie on
// that first page load (it is SameSite=Strict), so a signed-in member lands
// here. A request from this page does carry it: when it says we are signed
// in, go straight on.
fetch('/api/me', { credentials: 'same-origin' }).then((r) => { if (r.ok) location.replace(back) }).catch(() => {})

function show(which) {
  for (const k of Object.keys(tabs)) {
    tabs[k].setAttribute('aria-selected', String(k === which))
    forms[k].hidden = k !== which
  }
  err.textContent = ''
  const first = forms[which].querySelector('input')
  if (first) first.focus()
}
tabs.member.addEventListener('click', () => show('member'))
tabs.owner.addEventListener('click', () => show('owner'))

async function submit(form, body) {
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  err.textContent = ''
  try {
    const res = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || `The server answered ${res.status}.`)
    location.href = back
  } catch (e) {
    err.textContent = e.message
  } finally {
    btn.disabled = false
  }
}
forms.member.addEventListener('submit', (e) => {
  e.preventDefault()
  const f = new FormData(forms.member)
  const email = String(f.get('email') || '').trim()
  const code = String(f.get('code') || '').trim()
  if (!email || !code) { err.textContent = 'Type your email and your access code.'; return }
  submit(forms.member, { email, code })
})
forms.owner.addEventListener('submit', (e) => {
  e.preventDefault()
  const pin = String(new FormData(forms.owner).get('pin') || '').trim()
  if (!pin) { err.textContent = 'Type the owner PIN.'; return }
  submit(forms.owner, { pin })
})
