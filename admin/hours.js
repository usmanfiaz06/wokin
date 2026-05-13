/* =====================================================================
   WOK!N  ·  ADMIN · HOURS  ·  hours.js
   ---------------------------------------------------------------------
   - Weekly business hours (7 rows, one per weekday)
   - Force-closed kill switch (overrides all hours)
   - Custom "closed" banner message
   - All times = Asia/Karachi (PKT, UTC+5, no DST)
   ===================================================================== */

const DAYS = [
  "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"
];

const state = {
  hours:    [],       // 7 rows
  settings: null,     // single app_settings row
  realtime: null,
};

window.addEventListener("error", e => {
  const errEl = document.getElementById("authErr");
  if (errEl){ errEl.hidden = false; errEl.textContent = "JS ERROR · " + e.message; }
});

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("loginBtn").addEventListener("click", onSignIn);
  document.getElementById("loginForm").addEventListener("submit", onSignIn);
  ["email","password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); onSignIn(e); }
    });
  });
  document.getElementById("signOut").addEventListener("click", () => window.db.auth.signOut());
  document.getElementById("forceClosed").addEventListener("change", refreshKillVisual);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document.getElementById("copyMonHours").addEventListener("click", copyMondayToAll);

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
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "SIGNING IN…";
  try {
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error("No session returned");
    await enterApp(data.session);
  } catch (err){
    errEl.textContent = err.message || "Couldn't sign in.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  await loadAll();
  renderHours();
  renderSettings();
  startPKTClock();
  subscribe();
}

async function loadAll(){
  const [{ data: h, error: e1 }, { data: s, error: e2 }] = await Promise.all([
    window.db.from("business_hours").select("*").order("day_of_week"),
    window.db.from("app_settings").select("*").eq("id", 1).single(),
  ]);
  if (e1) toast("Couldn't load hours: " + e1.message);
  if (e2) toast("Couldn't load settings: " + e2.message);
  state.hours    = h || [];
  state.settings = s || { id:1, force_closed:false, closed_message:"" };
}

function subscribe(){
  if (state.realtime) try { state.realtime.unsubscribe(); } catch(e){}
  state.realtime = window.db.channel("hours-admin")
    .on("postgres_changes",
        { event:"*", schema:"public", table:"business_hours" },
        () => loadAll().then(() => { renderHours(); refreshLiveStatus(); }))
    .on("postgres_changes",
        { event:"*", schema:"public", table:"app_settings" },
        () => loadAll().then(() => { renderSettings(); refreshLiveStatus(); }))
    .subscribe();
}

/* ------------------------------------------------------------------ */
/*  PKT helpers                                                       */
/* ------------------------------------------------------------------ */
function pktNow(){
  // PKT = UTC+5 (no DST). Use UTC methods on a shifted Date so they
  // reflect PKT directly.
  return new Date(Date.now() + 5 * 3600 * 1000);
}
function pktDay()   { return pktNow().getUTCDay(); }
function pktHM()    { const d = pktNow(); return { h: d.getUTCHours(), m: d.getUTCMinutes() }; }
function pktClock() {
  const d = pktNow();
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function startPKTClock(){
  const tick = () => {
    const el = document.getElementById("pktClock");
    if (el) el.textContent = pktClock();
    refreshLiveStatus();
  };
  tick(); setInterval(tick, 30000);
}

function isOpenNow(){
  if (!state.settings || !state.hours.length) return { open:true, why:"loading" };
  if (state.settings.force_closed) return { open:false, why:"force", message: state.settings.closed_message };
  const day = pktDay();
  const today = state.hours.find(h => h.day_of_week === day);
  if (!today || today.is_closed) return { open:false, why:"day-off", today };
  const { h, m } = pktHM();
  const cur = h * 60 + m;
  const [oh, om] = today.opens_at.split(":").map(Number);
  let   [ch, cm] = today.closes_at.split(":").map(Number);
  const open = oh * 60 + om;
  let close   = ch * 60 + cm;
  if (close <= open) close += 24 * 60; // crosses midnight
  const curAdj = cur < open && (close > 24*60) ? cur + 24*60 : cur;
  if (curAdj >= open && curAdj < close) return { open:true, today };
  return { open:false, why:"hours", today };
}

function refreshLiveStatus(){
  const s = isOpenNow();
  const dot = document.getElementById("liveDot");
  const txt = document.getElementById("liveText");
  if (!dot || !txt) return;
  if (s.open){
    dot.style.background = "var(--green)";
    dot.style.boxShadow  = "0 0 0 0 rgba(46,139,87,.6)";
    txt.textContent = "OPEN";
    txt.style.color = "var(--green)";
  } else {
    dot.style.background = "var(--red)";
    dot.style.boxShadow  = "0 0 0 0 rgba(227,27,35,.6)";
    txt.textContent = "CLOSED";
    txt.style.color = "var(--red)";
  }

  const force = !!state.settings?.force_closed;
  const hl = document.getElementById("killHeadline");
  if (hl){
    hl.innerHTML = s.open ? "We are <em>OPEN</em>"
                          : (force ? "Force <em>CLOSED</em>" : "Currently <em>CLOSED</em>");
  }
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
function renderSettings(){
  if (!state.settings) return;
  document.getElementById("forceClosed").checked  = !!state.settings.force_closed;
  document.getElementById("closedMessage").value  = state.settings.closed_message || "";
  refreshKillVisual();
}

function refreshKillVisual(){
  const wrap = document.querySelector(".hr-kill");
  const on   = document.getElementById("forceClosed").checked;
  wrap.classList.toggle("is-armed", on);
  refreshLiveStatus();
}

async function saveSettings(){
  const btn = document.getElementById("saveSettings");
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SAVING…";
  try {
    const { error } = await window.db.from("app_settings").update({
      force_closed:    document.getElementById("forceClosed").checked,
      closed_message:  document.getElementById("closedMessage").value.trim() || null,
    }).eq("id", 1);
    if (error) throw error;
    toast("✓ Saved");
  } catch (err){
    toast("Save failed: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function renderHours(){
  const grid = document.getElementById("hoursGrid");
  grid.innerHTML = "";
  const today = pktDay();

  state.hours
    .slice()
    .sort((a,b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7))   // Mon-first display
    .forEach(row => {
      const isToday = row.day_of_week === today;
      const card = document.createElement("article");
      card.className = "day-row" + (isToday ? " is-today" : "") + (row.is_closed ? " is-off" : "");
      card.innerHTML = `
        <div class="day-label">
          <b>${DAYS[row.day_of_week]}</b>
          ${isToday ? `<span class="today-pill">TODAY</span>` : ""}
        </div>
        <div class="day-fields">
          <label class="m-toggle inline">
            <input type="checkbox" ${!row.is_closed ? "checked" : ""} data-open />
            <span class="m-toggle-track"></span>
            <span class="m-toggle-label">${row.is_closed ? "CLOSED" : "OPEN"}</span>
          </label>
          <div class="time-pair">
            <input type="time" data-opens  value="${row.opens_at.slice(0,5)}"  ${row.is_closed ? "disabled" : ""}/>
            <span class="dash">to</span>
            <input type="time" data-closes value="${row.closes_at.slice(0,5)}" ${row.is_closed ? "disabled" : ""}/>
          </div>
        </div>
        <button class="btn-ghost small" data-save>SAVE</button>
      `;
      const $open   = card.querySelector("[data-open]");
      const $opens  = card.querySelector("[data-opens]");
      const $closes = card.querySelector("[data-closes]");
      const $save   = card.querySelector("[data-save]");
      const $label  = card.querySelector(".m-toggle-label");
      $open.addEventListener("change", () => {
        const off = !$open.checked;
        $opens.disabled  = off;
        $closes.disabled = off;
        card.classList.toggle("is-off", off);
        $label.textContent = off ? "CLOSED" : "OPEN";
      });
      $save.addEventListener("click", () => saveDay(row.day_of_week, {
        is_closed:  !$open.checked,
        opens_at:   $opens.value,
        closes_at:  $closes.value,
      }, card));
      grid.appendChild(card);
    });
  refreshLiveStatus();
}

async function saveDay(day, row, card){
  const $save = card.querySelector("[data-save]");
  $save.disabled = true; const orig = $save.textContent; $save.textContent = "…";
  try {
    const { error } = await window.db.from("business_hours")
      .update(row).eq("day_of_week", day);
    if (error) throw error;
    toast(`✓ ${DAYS[day]} updated`);
    // Update local state too
    state.hours = state.hours.map(h => h.day_of_week === day ? { ...h, ...row } : h);
    refreshLiveStatus();
  } catch (err){
    toast("Save failed: " + err.message);
  } finally {
    $save.disabled = false; $save.textContent = orig;
  }
}

async function copyMondayToAll(){
  const mon = state.hours.find(h => h.day_of_week === 1);
  if (!mon){ toast("No Monday row found"); return; }
  if (!confirm("Copy Monday's hours (" + mon.opens_at.slice(0,5) + " → " + mon.closes_at.slice(0,5) + ") to every OPEN day?")) return;
  const updates = state.hours
    .filter(h => h.day_of_week !== 1 && !h.is_closed)
    .map(h => ({ ...h, opens_at: mon.opens_at, closes_at: mon.closes_at }));
  if (!updates.length){ toast("Nothing to update"); return; }
  for (const u of updates){
    await window.db.from("business_hours")
      .update({ opens_at: mon.opens_at, closes_at: mon.closes_at })
      .eq("day_of_week", u.day_of_week);
  }
  toast("✓ Monday's hours copied to " + updates.length + " day" + (updates.length === 1 ? "" : "s"));
  await loadAll();
  renderHours();
}

/* ------------------------------------------------------------------ */
/*  TOAST                                                             */
/* ------------------------------------------------------------------ */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
