/* =====================================================================
   WOK!N  ·  ADMIN · SITE TEXT  ·  site.js
   ---------------------------------------------------------------------
   Edit the homepage scrolling strip (ticker) + the key numbers it
   references (free-delivery threshold + delivery ETA).
   Table: public.site_settings  (single row, id = 'home')
   {threshold} / {eta} tokens in a message are substituted on the site.
   ===================================================================== */

const DEFAULTS = {
  messages: [
    "★ NEW · HOUSE COUPON WOKIN10 · 10% OFF YOUR FIRST ORDER",
    "★ FREE DELIVERY OVER {threshold}",
    "★ CASH ON DELIVERY ONLY",
    "★ APPROX. {eta} MIN TO YOUR DOOR",
  ],
  threshold: 1800,
  eta: 45,
};

const state = { messages: [], threshold: DEFAULTS.threshold, eta: DEFAULTS.eta };

window.addEventListener("error", e => {
  const el = document.getElementById("authErr");
  if (el){ el.hidden = false; el.textContent = "JS ERROR · " + e.message; }
});

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("loginBtn").addEventListener("click", onSignIn);
  document.getElementById("loginForm").addEventListener("submit", onSignIn);
  ["email","password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); onSignIn(e); } });
  });
  document.getElementById("signOut").addEventListener("click", () => window.db.auth.signOut());
  document.getElementById("stAdd").addEventListener("click", () => { state.messages.push(""); renderMsgs(); renderPreview(); });
  document.getElementById("stSave").addEventListener("click", save);
  document.getElementById("stThreshold").addEventListener("input", e => { state.threshold = +e.target.value || 0; renderPreview(); });
  document.getElementById("stEta").addEventListener("input", e => { state.eta = +e.target.value || 0; renderPreview(); });

  const { data: { session } } = await window.db.auth.getSession();
  if (session) enterApp(session);
});

async function onSignIn(e){
  if (e && e.preventDefault) e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("authErr");
  errEl.hidden = true;
  if (!email || !password){ errEl.textContent = "Enter email + password."; errEl.hidden = false; return; }
  const btn = document.getElementById("loginBtn");
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SIGNING IN…";
  try {
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await enterApp(data.session);
  } catch (err){ errEl.textContent = err.message || "Couldn't sign in."; errEl.hidden = false; }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  await load();
  renderAll();
}

async function load(){
  try {
    const { data, error } = await window.db.from("site_settings").select("*").eq("id", "home").limit(1);
    if (error) throw error;
    const s = (data || [])[0];
    if (s){
      state.messages  = Array.isArray(s.ticker_messages) && s.ticker_messages.length ? s.ticker_messages.map(String) : DEFAULTS.messages.slice();
      state.threshold = Number.isFinite(+s.free_delivery_threshold) && +s.free_delivery_threshold > 0 ? +s.free_delivery_threshold : DEFAULTS.threshold;
      state.eta       = Number.isFinite(+s.eta_minutes) && +s.eta_minutes > 0 ? +s.eta_minutes : DEFAULTS.eta;
      return;
    }
  } catch(e){
    toast(/site_settings/i.test(e.message || "") ? "Run the site-settings DB migration first" : "Couldn't load: " + (e.message || e));
  }
  // nothing saved yet (or table missing) → start from the current site defaults
  state.messages  = DEFAULTS.messages.slice();
  state.threshold = DEFAULTS.threshold;
  state.eta       = DEFAULTS.eta;
}

function renderAll(){
  document.getElementById("stThreshold").value = state.threshold;
  document.getElementById("stEta").value = state.eta;
  renderMsgs();
  renderPreview();
}

function fillTokens(msg){
  const money = "Rs. " + Math.round(Number(state.threshold)||0).toLocaleString("en-PK");
  return String(msg).replace(/\{threshold\}/gi, money).replace(/\{eta\}/gi, String(state.eta));
}

function renderMsgs(){
  const wrap = document.getElementById("stMsgs");
  wrap.innerHTML = "";
  if (!state.messages.length){
    wrap.innerHTML = `<div class="bn-empty">No messages — add one, or the site keeps its built-in strip.</div>`;
    return;
  }
  state.messages.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "st-msg";

    const input = document.createElement("input");
    input.type = "text"; input.value = m; input.maxLength = 90;
    input.placeholder = "e.g. ★ FREE DELIVERY OVER {threshold}";
    input.addEventListener("input", () => { state.messages[i] = input.value; renderPreview(); });
    row.appendChild(input);

    const ctl = document.createElement("div");
    ctl.className = "st-msg-ctl";
    ctl.appendChild(mkBtn("▲", "Move up", i === 0, () => { swap(i, i-1); }));
    ctl.appendChild(mkBtn("▼", "Move down", i === state.messages.length-1, () => { swap(i, i+1); }));
    const del = mkBtn("🗑", "Remove", false, () => { state.messages.splice(i,1); renderMsgs(); renderPreview(); });
    del.classList.add("cb-del");
    ctl.appendChild(del);
    row.appendChild(ctl);

    wrap.appendChild(row);
  });
}

function mkBtn(label, title, disabled, fn){
  const b = document.createElement("button");
  b.className = "btn-ghost small"; b.textContent = label; b.title = title; b.disabled = !!disabled;
  if (!disabled) b.addEventListener("click", fn);
  return b;
}

function swap(a, b){
  if (b < 0 || b >= state.messages.length) return;
  const t = state.messages[a]; state.messages[a] = state.messages[b]; state.messages[b] = t;
  renderMsgs(); renderPreview();
}

function renderPreview(){
  const row = document.getElementById("stPreview");
  const msgs = state.messages.filter(m => (m||"").trim());
  const once = msgs.map(m => { const s = document.createElement("span"); s.textContent = fillTokens(m); return s.outerHTML; }).join("");
  row.innerHTML = once + once;
}

async function save(){
  const btn = document.getElementById("stSave");
  const saved = document.getElementById("stSaved");
  const messages = state.messages.map(m => (m||"").trim()).filter(Boolean);
  const threshold = Math.max(0, Math.round(Number(state.threshold)||0));
  const eta = Math.max(1, Math.round(Number(state.eta)||0));
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SAVING…"; saved.hidden = true;
  try {
    const { error } = await window.db.from("site_settings").upsert({
      id: "home",
      ticker_messages: messages,
      free_delivery_threshold: threshold,
      eta_minutes: eta,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw error;
    saved.hidden = false;
    toast("✓ Saved · live on the site");
    setTimeout(() => { saved.hidden = true; }, 4000);
  } catch(e){
    toast(/site_settings/i.test(e.message || "") ? "Run the site-settings DB migration first" : "Save failed: " + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
