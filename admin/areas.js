/* =====================================================================
   WOK!N  ·  ADMIN · DELIVERY AREAS  ·  areas.js
   ---------------------------------------------------------------------
   Manage the delivery areas customers can pick in the location pop-up
   and at checkout. Add / rename / activate / delete.
   Table: public.delivery_areas
   ===================================================================== */

const state = { areas: [] };

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
  document.getElementById("arAdd").addEventListener("click", addArea);
  document.getElementById("arInput").addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); addArea(); }
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
  } catch (err){ errEl.textContent = err.message || "Couldn't sign in."; errEl.hidden = false; }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  await loadAreas();
  renderAreas();
}

async function loadAreas(){
  const { data, error } = await window.db.from("delivery_areas")
    .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error){
    toast(/delivery_areas/i.test(error.message || "") ? "Run the delivery-areas DB migration first" : "Couldn't load areas: " + error.message);
    state.areas = []; return;
  }
  state.areas = data || [];
}

function renderAreas(){
  const list = document.getElementById("arList");
  list.innerHTML = "";
  if (!state.areas.length){
    list.innerHTML = `<div class="bn-empty">No areas yet — add one above (until then the site uses its built-in list).</div>`;
    return;
  }
  state.areas.forEach(a => {
    const row = document.createElement("article");
    row.className = "bn-row" + (a.is_active ? "" : " is-off");

    const name = document.createElement("div");
    name.className = "bn-msg"; name.textContent = a.name;
    row.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "bn-actions";

    const status = document.createElement("span");
    status.className = "bn-status" + (a.is_active ? " is-live" : "");
    status.textContent = a.is_active ? "● LIVE" : "○ PAUSED";
    actions.appendChild(status);

    const toggle = document.createElement("button");
    toggle.className = "btn-ghost small";
    toggle.textContent = a.is_active ? "TURN OFF" : "TURN ON";
    toggle.title = a.is_active ? "Delivering here — click to pause" : "Paused — click to deliver here";
    toggle.addEventListener("click", () => setActive(a.id, !a.is_active));
    actions.appendChild(toggle);

    const edit = document.createElement("button");
    edit.className = "btn-ghost small"; edit.textContent = "RENAME";
    edit.addEventListener("click", () => renameArea(a.id, a.name));
    actions.appendChild(edit);

    const del = document.createElement("button");
    del.className = "btn-ghost small cb-del"; del.textContent = "🗑"; del.title = "Delete area";
    del.addEventListener("click", () => deleteArea(a.id, a.name));
    actions.appendChild(del);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function addArea(){
  const input = document.getElementById("arInput");
  const name = input.value.trim();
  if (!name){ toast("Type an area name first."); return; }
  if (state.areas.some(a => a.name.toLowerCase() === name.toLowerCase())){ toast("That area already exists."); return; }
  const position = state.areas.length ? Math.max(...state.areas.map(a => a.position || 0)) + 1 : 0;
  const { data, error } = await window.db.from("delivery_areas")
    .insert({ name, is_active: true, position }).select().single();
  if (error){
    toast(/delivery_areas/i.test(error.message || "") ? "Run the delivery-areas DB migration first" : "Couldn't add: " + error.message);
    return;
  }
  state.areas.push(data);
  input.value = "";
  renderAreas();
  toast("📍 Area added");
}

async function renameArea(id, current){
  const next = prompt("Rename area:", current);
  if (next === null) return;
  const name = next.trim();
  if (!name || name === current) return;
  const { error } = await window.db.from("delivery_areas").update({ name }).eq("id", id);
  if (error){ toast("Save failed: " + error.message); return; }
  state.areas = state.areas.map(a => a.id === id ? { ...a, name } : a);
  renderAreas();
  toast("✓ Area renamed");
}

async function setActive(id, on){
  const prev = state.areas.find(a => a.id === id);
  state.areas = state.areas.map(a => a.id === id ? { ...a, is_active: on } : a);
  renderAreas();
  const { error } = await window.db.from("delivery_areas").update({ is_active: on }).eq("id", id);
  if (error){
    if (prev) state.areas = state.areas.map(a => a.id === id ? prev : a);
    renderAreas(); toast("Save failed: " + error.message); return;
  }
  toast(on ? "✓ Delivering here" : "✓ Paused this area");
}

async function deleteArea(id, name){
  if (!confirm(`Delete delivery area "${name}"?`)) return;
  const { error } = await window.db.from("delivery_areas").delete().eq("id", id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.areas = state.areas.filter(a => a.id !== id);
  renderAreas();
  toast("🗑 Area deleted");
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
