/* Picked site script: flavor switcher and waitlist signup. No dependencies. */

/* Klaviyo public identifiers. Replace both. They are public, not secret.
   Site key: Klaviyo > Settings > Account > API keys (6 characters).
   List ID: Klaviyo > Lists > "Waitlist" > Settings. */
const KLAVIYO_COMPANY_ID = "REPLACE_WITH_PUBLIC_SITE_KEY";
const KLAVIYO_LIST_ID = "REPLACE_WITH_LIST_ID";

const FLAVORS = {
  strawberry: {
    name: "Strawberry",
    pouch: "pouch-strawberry.svg",
    fruit: "Freeze-dried strawberries",
    status: "First batch",
    line: "Sweet, a little tart, and the seedy bit you get from a real one.",
    vote: null
  },
  mango: {
    name: "Mango",
    pouch: "pouch-mango.svg",
    fruit: "Freeze-dried mango",
    status: "Up for a vote",
    line: "Ripe, round and sunny. The flavor of the fruit, not of a smoothie chain.",
    vote: "mango"
  },
  "raspberry-lemon": {
    name: "Raspberry Lemon",
    pouch: "pouch-raspberry-lemon.svg",
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

  const img = document.querySelector("[data-flavor-pouch]");
  if (img && !img.src.endsWith(f.pouch)) {
    const swap = () => {
      img.src = img.dataset.base + f.pouch;
      img.alt = `Concept of the Picked ${f.name} pouch`;
      requestAnimationFrame(() => img.classList.remove("is-swapping"));
    };
    if (prefersReduced) swap();
    else { img.classList.add("is-swapping"); setTimeout(swap, 220); }
  }
  const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
  set("[data-flavor-name]", f.name);
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
      if (KLAVIYO_COMPANY_ID.startsWith("REPLACE")) {
        say("The waitlist opens soon. For now, email hello@pickedprotein.com and we'll add you.", "error");
        return;
      }
      form.classList.add("is-busy");
      say("Adding you...");
      try {
        const res = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_COMPANY_ID}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", revision: "2024-10-15" },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                profile: { data: { type: "profile", attributes: {
                  email,
                  properties: { waitlist_terms: "updates", next_flavour: vote ? vote.value : null, signup_page: location.pathname }
                } } },
                custom_source: "pickedprotein.com waitlist"
              },
              relationships: { list: { data: { type: "list", id: KLAVIYO_LIST_ID } } }
            }
          })
        });
        if (!res.ok) throw new Error(String(res.status));
        say("You're on the list. Check your inbox to confirm.");
        form.reset();
      } catch (err) {
        say("That didn't go through. Try again in a minute, or email hello@pickedprotein.com.", "error");
      } finally {
        form.classList.remove("is-busy");
      }
    });
  });
}

initSwitcher();
initSignup();
