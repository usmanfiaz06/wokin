/* =====================================================================
   WOK!N  ·  ADMIN · QR GUESTS  ·  leads.js
   ---------------------------------------------------------------------
   Everyone who scanned the in-restaurant QR and filled in the form on
   /deals lands here. Search, copy the numbers for a WhatsApp/SMS blast,
   export a CSV, delete junk rows.
   Table: public.qr_leads (name, phone, email, source, created_at)
   ===================================================================== */

const state = { leads: [], query: "", realtime: null };

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

  document.getElementById("ldSearch").addEventListener("input", e => {
    state.query = e.target.value.trim().toLowerCase();
    renderLeads();
  });
  document.getElementById("ldCopy").addEventListener("click", copyNumbers);
  document.getElementById("ldExport").addEventListener("click", exportCsv);
  document.getElementById("ldRefresh").addEventListener("click", async () => {
    await loadLeads(); renderLeads(); toast("↻ Refreshed");
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
  await loadLeads();
  renderLeads();
  subscribeLive();
}

/* ------------------------------------------------------------------ */
/*  DATA                                                              */
/* ------------------------------------------------------------------ */
async function loadLeads(){
  const { data, error } = await window.db.from("qr_leads")
    .select("*").order("created_at", { ascending: false }).limit(2000);
  if (error){
    toast(/qr_leads/i.test(error.message || "")
      ? "Run supabase-qr-leads-migration.sql first"
      : "Couldn't load guests: " + error.message);
    state.leads = [];
    return;
  }
  state.leads = data || [];
}

/* New scans drop in without a refresh. */
function subscribeLive(){
  if (state.realtime) return;
  state.realtime = window.db.channel("qr_leads_live")
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"qr_leads" }, payload => {
      state.leads.unshift(payload.new);
      renderLeads();
      toast("📇 New guest · " + (payload.new.name || ""));
    })
    .subscribe();
}

function filtered(){
  if (!state.query) return state.leads;
  const q = state.query;
  return state.leads.filter(l =>
    (l.name  || "").toLowerCase().includes(q) ||
    (l.phone || "").toLowerCase().includes(q) ||
    (l.email || "").toLowerCase().includes(q)
  );
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
function renderLeads(){
  renderStats();

  const list = document.getElementById("ldList");
  list.innerHTML = "";
  const rows = filtered();

  if (!rows.length){
    const empty = document.createElement("div");
    empty.className = "ld-empty";
    empty.textContent = state.query
      ? "No guest matches that search."
      : "No scans yet. Put the QR on the tables — every guest who fills the form shows up here.";
    list.appendChild(empty);
    return;
  }

  rows.forEach(l => list.appendChild(leadRow(l)));
}

function leadRow(lead){
  const row = document.createElement("article");
  row.className = "ld-row";

  const av = document.createElement("div");
  av.className = "ld-av";
  av.textContent = (lead.name || "?").trim().charAt(0).toUpperCase();
  row.appendChild(av);

  const main = document.createElement("div");
  main.className = "ld-main";

  const name = document.createElement("b");
  name.textContent = lead.name || "—";
  main.appendChild(name);

  const links = document.createElement("div");
  links.className = "ld-links";

  const tel = document.createElement("a");
  tel.href = "tel:" + (lead.phone || "");
  tel.textContent = "📱 " + (lead.phone || "—");
  links.appendChild(tel);

  // Older scans captured an email; the form no longer asks for one, so
  // only show the link when there's actually an address.
  if (lead.email){
    const mail = document.createElement("a");
    mail.href = "mailto:" + lead.email;
    mail.textContent = "✉️ " + lead.email;
    links.appendChild(mail);
  }

  if (lead.phone){
    const wa = document.createElement("a");
    wa.href = "https://wa.me/" + lead.phone.replace(/\D/g, "");
    wa.target = "_blank"; wa.rel = "noopener";
    wa.textContent = "WhatsApp ↗";
    links.appendChild(wa);
  }

  main.appendChild(links);
  row.appendChild(main);

  const when = document.createElement("span");
  when.className = "ld-when";
  when.textContent = fmtWhen(lead.created_at);
  when.title = new Date(lead.created_at).toLocaleString("en-PK");
  row.appendChild(when);

  const del = document.createElement("button");
  del.className = "btn-ghost small ld-del";
  del.textContent = "🗑";
  del.title = "Delete this guest";
  del.addEventListener("click", () => deleteLead(lead));
  row.appendChild(del);

  return row;
}

function renderStats(){
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const t  = state.leads.filter(l => new Date(l.created_at) >= startOfToday).length;
  const w  = state.leads.filter(l => now - new Date(l.created_at).getTime() <= 7*864e5).length;
  const uniq = new Set(state.leads.map(l => (l.phone || "").replace(/\D/g, "")).filter(Boolean)).size;

  document.getElementById("stToday").textContent  = t;
  document.getElementById("stWeek").textContent   = w;
  document.getElementById("stTotal").textContent  = state.leads.length;
  document.getElementById("stUnique").textContent = uniq;
}

function fmtWhen(iso){
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return mins + "m ago";
  if (d.toDateString() === new Date().toDateString())
    return d.toLocaleTimeString("en-PK", { hour:"numeric", minute:"2-digit" });
  return d.toLocaleDateString("en-PK", { month:"short", day:"numeric" }) + " · " +
         d.toLocaleTimeString("en-PK", { hour:"numeric", minute:"2-digit" });
}

/* ------------------------------------------------------------------ */
/*  ACTIONS                                                           */
/* ------------------------------------------------------------------ */
async function deleteLead(lead){
  if (!confirm(`Delete this guest?\n\n${lead.name} · ${lead.phone}`)) return;
  const { error } = await window.db.from("qr_leads").delete().eq("id", lead.id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.leads = state.leads.filter(l => l.id !== lead.id);
  renderLeads();
  toast("🗑 Guest deleted");
}

/* Unique numbers of whatever is currently on screen (respects the search). */
function copyNumbers(){
  const nums = [...new Set(filtered().map(l => l.phone).filter(Boolean))];
  if (!nums.length){ toast("Nothing to copy."); return; }
  const text = nums.join(", ");
  const done = () => toast(`✓ ${nums.length} number${nums.length > 1 ? "s" : ""} copied`);
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}

function fallbackCopy(text, done){
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); }
  catch(e){ toast("Couldn't copy — select the numbers manually."); }
  finally { ta.remove(); }
}

function exportCsv(){
  const rows = filtered();
  if (!rows.length){ toast("Nothing to export."); return; }
  const head = ["Name","Mobile","Email","Source","Scanned at"];
  const body = rows.map(l => [
    l.name, l.phone, l.email, l.source,
    new Date(l.created_at).toLocaleString("en-PK"),
  ]);
  const csv = [head, ...body]
    .map(cols => cols.map(csvCell).join(","))
    .join("\r\n");

  const stamp = new Date().toISOString().slice(0,10);
  const blob = new Blob(["﻿" + csv], { type:"text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `wokin-qr-guests-${stamp}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`✓ ${rows.length} guests exported`);
}

/* Quote every cell, and defuse anything Excel would run as a formula. */
function csvCell(v){
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
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
