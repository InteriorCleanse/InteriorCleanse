/* Picked site script: flavor switcher, signup forms (Lot 001 line, send-your-label), source tracking. No dependencies. */

/* Klaviyo public identifiers. Replace both. They are public, not secret.
   Site key: Klaviyo > Settings > Account > API keys (6 characters).
   List ID: Klaviyo > Lists > "Waitlist" > Settings. */
const KLAVIYO_COMPANY_ID = "REPLACE_WITH_PUBLIC_SITE_KEY";
const KLAVIYO_LIST_ID = "REPLACE_WITH_LIST_ID";

const FLAVORS = {
  strawberry: {
    name: "Strawberry",
    from: "from strawberries.",
    pouch: "pouch-strawberry.svg",
    art: "strawberry.svg", artAlt: "A strawberry cut in half",
    fruit: "Freeze-dried strawberries",
    status: "Lot 001",
    line: "Sweet, a little tart, and the seedy bit you get from a real one.",
    vote: null
  },
  mango: {
    name: "Mango",
    from: "from mangoes.",
    pouch: "pouch-mango.svg",
    art: "mango.svg", artAlt: "A mango cheek, scored and ready to eat",
    fruit: "Freeze-dried mango",
    status: "Up for a vote",
    line: "Ripe, round and sunny. The flavor of the fruit, not of a smoothie chain.",
    vote: "mango"
  },
  "raspberry-lemon": {
    name: "Raspberry Lemon",
    from: "from raspberries and lemons.",
    pouch: "pouch-raspberry-lemon.svg",
    art: "raspberry-lemon.svg", artAlt: "A raspberry and a lemon slice",
    fruit: "Freeze-dried raspberries, lemon juice",
    status: "Up for a vote",
    line: "Bright raspberry with a squeeze of lemon. The tart one.",
    vote: "raspberry-lemon"
  }
};

const root = document.documentElement;
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setFlavor(key, { focus = false } = {}) {
  const f = FLAVORS[key];
  if (!f) return;
  root.dataset.flavor = key;
  try { localStorage.setItem("picked-flavor", key); } catch (e) { /* storage blocked: fine */ }

  document.querySelectorAll('[role="tab"][data-flavor]').forEach((tab) => {
    const on = tab.dataset.flavor === key;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  });

  const pouch = document.querySelector("[data-flavor-pouch]");
  if (pouch && !pouch.src.endsWith(f.pouch)) {
    pouch.src = pouch.dataset.base + f.pouch;
    pouch.alt = `Concept of the Picked ${f.name} pouch: a green leafy top, the cut fruit and the fruit sticker`;
  }
  const stage = document.querySelector("[data-stage]");
  const art = document.querySelector("[data-flavor-art]");
  const sticker = document.querySelector("[data-flavor-sticker]");
  if (stage && art && !art.src.endsWith(f.art)) {
    const swap = () => {
      art.src = art.dataset.base + f.art; art.alt = f.artAlt;
      if (sticker) {
        sticker.src = `${sticker.dataset.base}sticker-${key}.svg`;
        sticker.alt = `The Picked fruit sticker: the grams of real ${f.name.toLowerCase()} in every scoop, printed once the recipe is final`;
      }
      requestAnimationFrame(() => stage.classList.remove("is-swapping"));
    };
    if (prefersReduced) swap();
    else { stage.classList.add("is-swapping"); setTimeout(swap, 200); }
  }
  const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
  set("[data-flavor-name]", `${f.name},`);
  set("[data-flavor-from]", f.from);
  const panel = document.getElementById("flavor-panel");
  if (panel) panel.setAttribute("aria-labelledby", `tab-${key}`);
  set("[data-flavor-fruit]", f.fruit);
  set("[data-flavor-status]", f.status);
  set("[data-flavor-line]", f.line);

  const voteBtn = document.querySelector("[data-flavor-vote]");
  if (voteBtn) {
    voteBtn.hidden = !f.vote;
    voteBtn.textContent = f.vote ? `Vote for ${f.name}` : "";
    voteBtn.dataset.vote = f.vote || "";
  }
}

function initSwitcher() {
  const tabs = [...document.querySelectorAll('[role="tab"][data-flavor]')];
  if (!tabs.length) return;
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => setFlavor(tab.dataset.flavor));
    tab.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      setFlavor(next.dataset.flavor, { focus: true });
    });
  });
  let saved = null;
  try { saved = localStorage.getItem("picked-flavor"); } catch (e) { saved = null; }
  setFlavor(FLAVORS[saved] ? saved : "strawberry");

  const voteBtn = document.querySelector("[data-flavor-vote]");
  if (voteBtn) voteBtn.addEventListener("click", () => {
    const radio = document.querySelector(`input[name="next_flavor"][value="${voteBtn.dataset.vote}"]`);
    if (radio) radio.checked = true;
    const join = document.getElementById("join");
    if (join) join.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
    const email = document.getElementById("email-join");
    if (email) setTimeout(() => email.focus({ preventScroll: true }), prefersReduced ? 0 : 500);
  });
}

/* Where a visitor came from: UTM tags and a ?ref= code, kept for this visit only. */
const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];
function captureSource() {
  const params = new URLSearchParams(location.search);
  SOURCE_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) { try { sessionStorage.setItem(`picked-${k}`, v.slice(0, 80)); } catch (e) { /* fine */ } }
  });
}
function readSource() {
  const out = {};
  SOURCE_KEYS.forEach((k) => { try { const v = sessionStorage.getItem(`picked-${k}`); if (v) out[k] = v; } catch (e) { /* fine */ } });
  return out;
}

function initSignup() {
  document.querySelectorAll("form.signup").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector(".status");
      const say = (text, kind = "ok") => { status.textContent = text; status.dataset.kind = kind; };
      const input = form.querySelector('input[type="email"]');
      const email = input.value.trim();
      const vote = form.querySelector('input[name="next_flavor"]:checked');

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        say("That email doesn't look complete. Check it and try again.", "error");
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      for (const field of form.querySelectorAll("input[required]:not([type=email])")) {
        const empty = field.type === "checkbox" ? !field.checked : !field.value.trim();
        if (empty) {
          say(field.type === "checkbox" ? "Tick the box to confirm you're 18 or older." : "Tell us which product, so we know what to read.", "error");
          field.setAttribute("aria-invalid", "true");
          field.focus();
          return;
        }
        field.removeAttribute("aria-invalid");
      }
      if (KLAVIYO_COMPANY_ID.startsWith("REPLACE")) {
        say("The line opens soon. For now, email hello@pickedprotein.com and we'll add you.", "error");
        return;
      }
      const properties = { waitlist_terms: "updates", next_flavour: vote ? vote.value : null, signup_page: location.pathname, signup_form: form.dataset.source || "site", ...readSource() };
      form.querySelectorAll("input[name]:not([type=email]):not([name=next_flavor])").forEach((field) => {
        if (field.type === "checkbox") properties[field.name] = field.checked ? field.value : null;
        else if (field.value.trim()) properties[field.name] = field.value.trim().slice(0, 120);
      });
      form.classList.add("is-busy");
      say("Adding you\u2026");
      try {
        const res = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_COMPANY_ID}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", revision: "2024-10-15" },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                profile: { data: { type: "profile", attributes: { email, properties } } },
                custom_source: `pickedprotein.com ${form.dataset.source || "waitlist"}`
              },
              relationships: { list: { data: { type: "list", id: KLAVIYO_LIST_ID } } }
            }
          })
        });
        if (!res.ok) throw new Error(String(res.status));
        if (form.dataset.thanks) { location.href = form.dataset.thanks; return; }
        say("You're in line. Check your inbox to confirm.");
        form.reset();
      } catch (err) {
        say("That didn't go through. Try again in a minute, or email hello@pickedprotein.com.", "error");
      } finally {
        form.classList.remove("is-busy");
      }
    });
  });
}

/* Thanks page: copy the share link. */
function initShare() {
  const btn = document.querySelector("[data-copy]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const field = document.getElementById(btn.dataset.copy);
    try { await navigator.clipboard.writeText(field.value); btn.textContent = "Copied"; }
    catch (e) { field.select(); btn.textContent = "Press copy"; }
    setTimeout(() => { btn.textContent = "Copy link"; }, 1800);
  });
}

captureSource();
initSwitcher();
initSignup();
initShare();
