/* =====================================================================
   WOK!N  ·  ADMIN · TABLES & QR  ·  tables.js
   ---------------------------------------------------------------------
   Create per-table / takeaway / delivery QR codes, download or print
   them, and see scans + orders per QR. Dine-in QRs open /t?t=<token>.
   Tables: restaurant_tables, qr_scans, orders(table_label)
   ===================================================================== */

const state = { tables: [], scans: {}, orders: {} };

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
  document.getElementById("tbAdd").addEventListener("click", addTable);
  document.getElementById("tbLabel").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); addTable(); } });

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
  await loadAll();
  renderTables();
}

async function loadAll(){
  const { data: tables, error } = await window.db.from("restaurant_tables")
    .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error){
    toast(/restaurant_tables/i.test(error.message || "") ? "Run the tables DB migration first" : "Couldn't load: " + error.message);
    state.tables = []; return;
  }
  state.tables = tables || [];
  // scan counts per token
  state.scans = {};
  const { data: scans } = await window.db.from("qr_scans").select("token");
  (scans || []).forEach(s => { state.scans[s.token] = (state.scans[s.token] || 0) + 1; });
  // dine-in order counts per table label
  state.orders = {};
  const { data: orders } = await window.db.from("orders").select("table_label").eq("order_type", "dine-in");
  (orders || []).forEach(o => { if (o.table_label) state.orders[o.table_label] = (state.orders[o.table_label] || 0) + 1; });
}

function qrTarget(t){ return `${location.origin}/t?t=${t.token}`; }
const KIND_LABEL = { "dine-in": "DINE-IN", "takeaway": "TAKEAWAY", "delivery": "DELIVERY" };

function renderTables(){
  const grid = document.getElementById("tbGrid");
  grid.innerHTML = "";
  if (!state.tables.length){
    grid.innerHTML = `<div class="bn-empty">No tables yet — add one above (e.g. “Table 1”, dine-in) to generate its QR code.</div>`;
    return;
  }
  state.tables.forEach(t => {
    const card = document.createElement("article");
    card.className = "tb-card" + (t.is_active ? "" : " is-off");
    const url = qrTarget(t);
    card.innerHTML = `
      <div class="tb-card-head">
        <div>
          <span class="tb-kind tb-kind-${t.kind}">${KIND_LABEL[t.kind] || t.kind}</span>
          <h3></h3>
        </div>
        <span class="bn-status${t.is_active ? " is-live" : ""}">${t.is_active ? "● LIVE" : "○ OFF"}</span>
      </div>
      <div class="tb-qr" data-qr></div>
      <div class="tb-stats">
        <div><b>${state.scans[t.token] || 0}</b><span>scans</span></div>
        <div><b>${t.kind === "dine-in" ? (state.orders[t.label] || 0) : "—"}</b><span>orders</span></div>
      </div>
      <div class="tb-actions">
        <button class="btn-primary small" data-dl>⤓ PNG</button>
        <button class="btn-ghost small" data-print>🖨 Print</button>
        <button class="btn-ghost small" data-toggle>${t.is_active ? "Turn off" : "Turn on"}</button>
        <button class="btn-ghost small cb-del" data-del title="Delete">🗑</button>
      </div>
    `;
    card.querySelector("h3").textContent = t.label;
    grid.appendChild(card);

    // render QR
    const qrBox = card.querySelector("[data-qr]");
    try { new QRCode(qrBox, { text: url, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M }); }
    catch(e){ qrBox.textContent = "QR lib not loaded"; }

    card.querySelector("[data-dl]").addEventListener("click", () => downloadQR(qrBox, t.label));
    card.querySelector("[data-print]").addEventListener("click", () => printQR(qrBox, t));
    card.querySelector("[data-toggle]").addEventListener("click", () => setActive(t.id, !t.is_active));
    card.querySelector("[data-del]").addEventListener("click", () => deleteTable(t.id, t.label));
  });
}

function qrDataUrl(qrBox){
  const c = qrBox.querySelector("canvas");
  if (c) return c.toDataURL("image/png");
  const img = qrBox.querySelector("img");
  return img ? img.src : null;
}
function downloadQR(qrBox, label){
  const url = qrDataUrl(qrBox); if (!url) return;
  const a = document.createElement("a");
  a.href = url; a.download = "wokin-qr-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png";
  a.click();
}
function printQR(qrBox, t){
  const url = qrDataUrl(qrBox); if (!url) return;
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${t.label} QR</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0 0 4px">WOK!N</h1>
      <p style="margin:0 0 20px;color:#555;letter-spacing:.2em">${KIND_LABEL[t.kind]||t.kind} · ${t.label}</p>
      <img src="${url}" style="width:320px;height:320px" />
      <p style="margin-top:20px;font-size:20px;font-weight:700">Scan to order</p>
    </body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

async function addTable(){
  const labelEl = document.getElementById("tbLabel");
  const label = labelEl.value.trim();
  const kind = document.getElementById("tbKind").value;
  if (!label){ toast("Give it a label (e.g. Table 5)."); return; }
  const position = state.tables.length ? Math.max(...state.tables.map(t => t.position || 0)) + 1 : 0;
  const { data, error } = await window.db.from("restaurant_tables")
    .insert({ label, kind, is_active: true, position }).select().single();
  if (error){
    toast(/restaurant_tables/i.test(error.message || "") ? "Run the tables DB migration first" : "Couldn't add: " + error.message);
    return;
  }
  state.tables.push(data);
  labelEl.value = "";
  renderTables();
  toast("🍽️ " + label + " added");
}

async function setActive(id, on){
  const prev = state.tables.find(t => t.id === id);
  state.tables = state.tables.map(t => t.id === id ? { ...t, is_active: on } : t);
  renderTables();
  const { error } = await window.db.from("restaurant_tables").update({ is_active: on }).eq("id", id);
  if (error){ if (prev) state.tables = state.tables.map(t => t.id === id ? prev : t); renderTables(); toast("Save failed: " + error.message); return; }
  toast(on ? "✓ QR active" : "✓ QR turned off");
}

async function deleteTable(id, label){
  if (!confirm(`Delete "${label}" and its QR? Existing printed codes will stop working.`)) return;
  const { error } = await window.db.from("restaurant_tables").delete().eq("id", id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.tables = state.tables.filter(t => t.id !== id);
  renderTables();
  toast("🗑 " + label + " deleted");
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
