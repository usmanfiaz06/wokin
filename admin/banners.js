/* =====================================================================
   WOK!N  ·  ADMIN · DEALS BANNER  ·  banners.js
   ---------------------------------------------------------------------
   Manage the scrolling promo banner shown across the top of the
   customer menu. Add / activate / deactivate / delete deals.
   Table: public.promo_banners (message, is_active, position, created_at)
   ===================================================================== */

const state = { banners: [], realtime: null };

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
  document.getElementById("bnAdd").addEventListener("click", addBanner);
  document.getElementById("bnInput").addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); addBanner(); }
  });

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
  } catch (err){
    errEl.textContent = err.message || "Couldn't sign in."; errEl.hidden = false;
  } finally { btn.disabled = false; btn.textContent = orig; }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  await loadBanners();
  renderBanners();
}

async function loadBanners(){
  const { data, error } = await window.db.from("promo_banners")
    .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error){
    toast(/promo_banners/i.test(error.message || "")
      ? "Run the deals-banner DB migration first"
      : "Couldn't load deals: " + error.message);
    state.banners = [];
    return;
  }
  state.banners = data || [];
}

function renderBanners(){
  const list = document.getElementById("bnList");
  list.innerHTML = "";
  if (!state.banners.length){
    list.innerHTML = `<div class="bn-empty">No deals yet — add one above. It appears in a scrolling banner at the top of the customer menu.</div>`;
    return;
  }
  state.banners.forEach(b => {
    const row = document.createElement("article");
    row.className = "bn-row" + (b.is_active ? "" : " is-off");
    const msg = document.createElement("div");
    msg.className = "bn-msg";
    msg.textContent = b.message;                     // safe
    row.appendChild(msg);

    const actions = document.createElement("div");
    actions.className = "bn-actions";

    const status = document.createElement("span");
    status.className = "bn-status" + (b.is_active ? " is-live" : "");
    status.textContent = b.is_active ? "● LIVE ON SITE" : "○ HIDDEN";
    actions.appendChild(status);

    const toggle = document.createElement("button");
    toggle.className = "btn-ghost small bn-toggle";
    toggle.textContent = b.is_active ? "TURN OFF" : "TURN ON";
    toggle.title = b.is_active ? "Currently showing — click to hide it" : "Currently hidden — click to show it on the site";
    toggle.addEventListener("click", () => setActive(b.id, !b.is_active));
    actions.appendChild(toggle);

    const del = document.createElement("button");
    del.className = "btn-ghost small bn-del";
    del.textContent = "🗑";
    del.title = "Delete deal";
    del.addEventListener("click", () => deleteBanner(b.id, b.message));
    actions.appendChild(del);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function addBanner(){
  const input = document.getElementById("bnInput");
  const message = input.value.trim();
  if (!message){ toast("Type a deal first."); return; }
  const position = state.banners.length
    ? Math.max(...state.banners.map(b => b.position || 0)) + 1 : 0;
  const { data, error } = await window.db.from("promo_banners")
    .insert({ message, is_active: true, position }).select().single();
  if (error){
    toast(/promo_banners/i.test(error.message || "")
      ? "Run the deals-banner DB migration first"
      : "Couldn't add: " + error.message);
    return;
  }
  state.banners.push(data);
  input.value = "";
  renderBanners();
  toast("🔥 Deal added");
}

async function setActive(id, on){
  const prev = state.banners.find(b => b.id === id);
  state.banners = state.banners.map(b => b.id === id ? { ...b, is_active: on } : b);
  renderBanners();
  const { error } = await window.db.from("promo_banners").update({ is_active: on }).eq("id", id);
  if (error){
    if (prev) state.banners = state.banners.map(b => b.id === id ? prev : b);
    renderBanners();
    toast("Save failed: " + error.message);
    return;
  }
  toast(on ? "✓ Deal is now live" : "✓ Deal hidden");
}

async function deleteBanner(id, message){
  if (!confirm(`Delete this deal?\n\n"${message}"`)) return;
  const { error } = await window.db.from("promo_banners").delete().eq("id", id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.banners = state.banners.filter(b => b.id !== id);
  renderBanners();
  toast("🗑 Deal deleted");
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
