/* =====================================================================
   WOK!N  ·  ADMIN  ·  admin.js
   ---------------------------------------------------------------------
   - Supabase Auth (email + password) gate
   - Live orders board with realtime postgres_changes subscription
   - 6 columns: new / accepted / cooking / ready / out_for_delivery / delivered
   - Click an order → modal with full details + status update actions
   - Today's summary stats (count, revenue, avg ticket, delivered, cancelled)
   - Print-friendly receipt via browser print
   ===================================================================== */

// ---- Surface ALL JS errors to the visible auth-error box so the user
//      never has to open dev tools to see what broke. -------------------
function _showAuthErr(msg, isOk = false){
  const el = document.getElementById("authErr");
  if (!el) return;
  el.hidden = false;
  el.style.background = isOk ? "rgba(46,139,87,.18)" : "rgba(227,27,35,.18)";
  el.style.color      = isOk ? "#9DE0B6" : "#FFB1B6";
  el.textContent = msg;
}
window.addEventListener("error", e => {
  _showAuthErr("JS ERROR · " + e.message + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : ""));
});
window.addEventListener("unhandledrejection", e => {
  const reason = e.reason && (e.reason.message || JSON.stringify(e.reason));
  _showAuthErr("ASYNC ERROR · " + reason);
});
console.log("[wokin/admin] script loaded · supabase global?", typeof window.supabase, "· db?", !!window.db);

const STATUSES = [
  { key:"new",              label:"NEW",              next:"accepted",         nextLabel:"ACCEPT ORDER"   },
  { key:"accepted",         label:"ACCEPTED",         next:"cooking",          nextLabel:"START COOKING"  },
  { key:"cooking",          label:"COOKING",          next:"ready",            nextLabel:"MARK READY"     },
  { key:"ready",            label:"READY",            next:"out_for_delivery", nextLabel:"SEND OUT"       },
  { key:"out_for_delivery", label:"OUT",              next:"delivered",        nextLabel:"MARK DELIVERED" },
  { key:"delivered",        label:"DELIVERED",        next:null,               nextLabel:null             },
];
// Pickup orders skip "out for delivery"; pressing the action on "ready" goes straight to "delivered"
const PICKUP_NEXT = { ready: "delivered" };
const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label]));

const fmtPKR = n => "Rs. " + Math.round(Number(n)||0).toLocaleString("en-PK");
const fmtTime = iso => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("en-PK", { hour: "numeric", minute:"2-digit" });
  return sameDay ? t : d.toLocaleDateString("en-PK", { month:"short", day:"numeric" }) + " · " + t;
};
const minutesAgo = iso => Math.round((Date.now() - new Date(iso).getTime()) / 60000);

/* ------------------------------------------------------------------ */
/*  STATE                                                             */
/* ------------------------------------------------------------------ */
const state = {
  orders: new Map(),    // id → order row
  itemsByOrder: new Map(), // order_id → [items]
  realtime: null,
  currentModalId: null,
  dayFilter: "today",   // today | yesterday | 7days | all | "YYYY-MM-DD"
};

/* ------------------------------------------------------------------ */
/*  AUTH                                                              */
/* ------------------------------------------------------------------ */
async function init(){
  // bind login (click on the button, not form submit, to avoid page reloads)
  const loginBtn = document.getElementById("loginBtn");
  const loginForm = document.getElementById("loginForm");
  if (loginBtn) loginBtn.addEventListener("click", onSignIn);
  if (loginForm) loginForm.addEventListener("submit", onSignIn);
  // Enter on either field submits too
  ["email","password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); onSignIn(e); }
    });
  });
  document.getElementById("signOut").addEventListener("click", onSignOut);
  document.getElementById("modalClose").addEventListener("click", closeModal);

  // New-order alarm controls
  setSoundEnabled(alarm.enabled);   // reflect saved preference in the button
  const soundBtn = document.getElementById("soundToggle");
  if (soundBtn) soundBtn.addEventListener("click", () => { primeAudio(); setSoundEnabled(!alarm.enabled); });
  const silenceBtn = document.getElementById("alarmSilence");
  if (silenceBtn) silenceBtn.addEventListener("click", () => { alarm.snoozed = true; updateAlarm(); });
  const banner = document.getElementById("alarmBanner");
  if (banner) banner.addEventListener("click", e => {
    if (e.target.closest("#alarmSilence")) return;  // silence handled above
    openOldestNew();
  });
  // Any click/keypress primes the audio context (browsers need a gesture)
  ["click","keydown"].forEach(ev =>
    document.addEventListener(ev, primeAudio, { once: true }));

  // Day filter chips
  document.querySelectorAll(".df-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      state.dayFilter = chip.dataset.day;
      document.querySelectorAll(".df-chip").forEach(c => c.classList.toggle("is-on", c === chip));
      document.getElementById("dfDate").value = "";
      renderBoard();
      renderStats();
    });
  });
  document.getElementById("dfDate").addEventListener("change", e => {
    if (!e.target.value) return;
    state.dayFilter = e.target.value;
    document.querySelectorAll(".df-chip").forEach(c => c.classList.remove("is-on"));
    renderBoard();
    renderStats();
  });
  document.getElementById("orderModal").addEventListener("click", e => {
    if (e.target.id === "orderModal") closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  startClock();

  // Check existing session
  const { data: { session } } = await window.db.auth.getSession();
  if (session) {
    enterApp(session);
  } else {
    showAuth();
  }

  // React to auth state changes (e.g. token refresh, sign out elsewhere)
  window.db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session)  enterApp(session);
    if (event === "SIGNED_OUT")            { teardown(); showAuth(); }
  });
}

async function onSignIn(e){
  if (e && e.preventDefault) e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("authErr");
  errEl.hidden = true;
  errEl.style.background = ""; errEl.style.color = ""; // reset visual override

  if (!email || !password){
    _showAuthErr("Enter email + password.");
    return;
  }
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "SIGNING IN…";

  try {
    if (!window.db) throw new Error("Supabase client not loaded. Reload the page.");
    if (!window.db.auth || !window.db.auth.signInWithPassword)
      throw new Error("Supabase auth module missing. Wrong SDK version?");
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error("Signed in but no session returned. Check API key permissions.");
    console.log("[admin] sign-in OK, entering app with session for", data.user?.email);
    // Don't rely on onAuthStateChange — call enterApp directly.
    await enterApp(data.session);
  } catch (err) {
    console.error("[admin] sign-in failed:", err);
    _showAuthErr((err && err.message) ? err.message : "Couldn't sign in.");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function onSignOut(){
  await window.db.auth.signOut();
}

function showAuth(){
  document.getElementById("authScreen").hidden = false;
  document.getElementById("appScreen").hidden = true;
}
async function enterApp(session){
  try {
    console.log("[admin] enterApp called for", session?.user?.email);
    document.getElementById("authScreen").hidden = true;
    document.getElementById("appScreen").hidden = false;
    document.getElementById("whoami").textContent = session.user.email;

    // Even if these fail, we stay on the dashboard
    await refreshAll().catch(err => {
      console.error("[admin] refreshAll failed:", err);
      toast("Couldn't load orders: " + (err.message || err));
    });
    try { subscribeRealtime(); }
    catch(err){ console.error("[admin] subscribeRealtime failed:", err); }
  } catch (err) {
    console.error("[admin] enterApp blew up:", err);
    _showAuthErr("Signed in but dashboard failed to load: " + (err.message || err));
  }
}

function teardown(){
  if (state.realtime){
    try { state.realtime.unsubscribe(); } catch(e){}
    state.realtime = null;
  }
  state.orders.clear();
  state.itemsByOrder.clear();
}

/* ------------------------------------------------------------------ */
/*  DATA FETCH                                                        */
/* ------------------------------------------------------------------ */
async function refreshAll(){
  // last 48 hours of orders, newest first
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: orders, error } = await window.db
    .from("orders")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error){
    console.error("[admin] fetch orders failed", error);
    toast("Couldn't load orders: " + error.message);
    return;
  }

  state.orders.clear();
  orders.forEach(o => state.orders.set(o.id, o));

  // fetch items for these orders (so the modal opens instantly)
  if (orders.length){
    const ids = orders.map(o => o.id);
    const { data: items } = await window.db
      .from("order_items")
      .select("*")
      .in("order_id", ids);
    state.itemsByOrder.clear();
    (items||[]).forEach(it => {
      if (!state.itemsByOrder.has(it.order_id)) state.itemsByOrder.set(it.order_id, []);
      state.itemsByOrder.get(it.order_id).push(it);
    });
    for (const arr of state.itemsByOrder.values()){
      arr.sort((a,b) => (a.position ?? 0) - (b.position ?? 0));
    }
  }

  renderBoard();
  renderStats();
}

/* ------------------------------------------------------------------ */
/*  REALTIME                                                          */
/* ------------------------------------------------------------------ */
function subscribeRealtime(){
  if (state.realtime){
    try { state.realtime.unsubscribe(); } catch(e){}
  }
  state.realtime = window.db
    .channel("orders-board")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        onOrderChange)
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        onItemInsert)
    .subscribe();
}

function onOrderChange(payload){
  const o = payload.new || payload.old;
  if (!o) return;

  if (payload.eventType === "DELETE"){
    state.orders.delete(o.id);
  } else {
    state.orders.set(o.id, payload.new);
  }

  if (payload.eventType === "INSERT"){
    alarm.snoozed = false;   // a fresh order always re-arms the alarm
    toast(`★ NEW ORDER · ${payload.new.order_number}`);
    // Pop the order open so staff can accept / reject right away — but
    // don't yank them away from one they're already working on.
    if (!state.currentModalId){
      setTimeout(() => {
        if (!state.currentModalId && state.orders.has(o.id) &&
            state.orders.get(o.id).status === "new"){
          openModal(o.id);
        }
      }, 400);
    }
  }

  renderBoard({ flashId: payload.eventType === "INSERT" ? o.id : null });
  renderStats();

  // if the modal is open for this order, refresh it
  if (state.currentModalId === o.id) openModal(o.id);
}

function onItemInsert(payload){
  const it = payload.new;
  if (!state.itemsByOrder.has(it.order_id)) state.itemsByOrder.set(it.order_id, []);
  state.itemsByOrder.get(it.order_id).push(it);
}

/* ------------------------------------------------------------------ */
/*  NEW-ORDER ALARM                                                    */
/*  Rings on a loop while any order is still in "new" (un-accepted),   */
/*  so an order is never missed. Stops the moment the last new order   */
/*  is accepted (or the chef hits SILENCE).                            */
/* ------------------------------------------------------------------ */
const alarm = {
  audio: null,
  enabled: localStorage.getItem("wokin_admin_sound") !== "off", // default ON
  snoozed: false,   // SILENCE mutes current batch; a brand-new order un-snoozes
};

// Build a looping two-tone alarm as an in-memory WAV (no external file).
// A real <audio> element keeps playing in BACKGROUND / inactive tabs —
// setInterval + WebAudio gets throttled or suspended when the tab is hidden,
// which is why the old chime didn't ring when staff were on another tab.
function buildAlarmAudio(){
  const sr = 22050, dur = 1.7, n = Math.round(sr * dur);
  const pcm = new Int16Array(n);
  // Bright ascending chime (A5 · C#6 · E6) with a bell-like decay, then a
  // short gap — pleasant but unmistakable, repeated on loop.
  const notes = [ { f: 880, t: 0.00 }, { f: 1108.7, t: 0.18 }, { f: 1318.5, t: 0.36 } ];
  const noteLen = 0.5;
  for (let i = 0; i < n; i++){
    const t = i / sr;
    let s = 0;
    for (const note of notes){
      const dt = t - note.t;
      if (dt >= 0 && dt < noteLen){
        const env = Math.exp(-dt * 5.5);                       // bell decay
        s += Math.sin(2 * Math.PI * note.f * dt) * env;        // fundamental
        s += Math.sin(2 * Math.PI * note.f * 2 * dt) * env * 0.3; // 2nd harmonic for sparkle
      }
    }
    s *= 0.6;                                  // headroom for summed notes
    if (s > 1) s = 1; else if (s < -1) s = -1; // hard clamp
    pcm[i] = s * 32767;
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, pcm[i], true);
  let bin = ""; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  const a = new Audio("data:audio/wav;base64," + btoa(bin));
  a.loop = true;
  a.volume = 1.0;            // always full volume
  return a;
}

function alarmEl(){
  if (!alarm.audio) alarm.audio = buildAlarmAudio();
  return alarm.audio;
}

// Unlock audio on a user gesture (browsers block autoplay until then).
// Once unlocked, later play() calls work even when the tab is in the
// background — which is exactly what we need for new-order alerts.
function primeAudio(){
  try {
    const a = alarmEl();
    a.play().then(() => { if (!alarmShouldRing()) { a.pause(); a.currentTime = 0; } }).catch(() => {});
  } catch(e){}
}

function alarmShouldRing(){
  return countNewOrders() > 0 && alarm.enabled && !alarm.snoozed;
}

function startAlarmSound(){
  try { const a = alarmEl(); if (a.paused) a.play().catch(() => {}); } catch(e){}
}
function stopAlarmSound(){
  try { const a = alarm.audio; if (a){ a.pause(); a.currentTime = 0; } } catch(e){}
}

function countNewOrders(){
  let n = 0;
  state.orders.forEach(o => { if (o.status === "new") n++; });
  return n;
}

// Single source of truth — call after anything that changes orders.
function updateAlarm(){
  const n = countNewOrders();
  const banner  = document.getElementById("alarmBanner");
  const countEl = document.getElementById("alarmCount");
  const ringing = n > 0 && alarm.enabled && !alarm.snoozed;

  if (banner){
    banner.hidden = n === 0;
    banner.classList.toggle("is-muted", n > 0 && !ringing);
  }
  if (countEl) countEl.textContent = n;

  if (ringing) startAlarmSound();
  else         stopAlarmSound();
}

// Open the longest-waiting un-accepted order (used by the alert banner).
function openOldestNew(){
  const news = [...state.orders.values()]
    .filter(o => o.status === "new")
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  if (news.length) openModal(news[0].id);
}

function setSoundEnabled(on){
  alarm.enabled = on;
  localStorage.setItem("wokin_admin_sound", on ? "on" : "off");
  const btn = document.getElementById("soundToggle");
  if (btn){
    btn.classList.toggle("is-off", !on);
    btn.innerHTML = on ? "🔔 SOUND: ON" : "🔕 SOUND: OFF";
  }
  updateAlarm();
}

/* ------------------------------------------------------------------ */
/*  DAY FILTER                                                        */
/* ------------------------------------------------------------------ */
function _startOfDayPKT(d = new Date()){
  // PKT is UTC+5, no DST
  const offsetMs = 5 * 3600 * 1000;
  const pkt = new Date(d.getTime() + offsetMs);
  pkt.setUTCHours(0,0,0,0);
  return new Date(pkt.getTime() - offsetMs);
}
function filterByDay(orders){
  const day = state.dayFilter;
  if (day === "all") return orders;
  const todayStart = _startOfDayPKT();
  if (day === "today")      return orders.filter(o => new Date(o.created_at) >= todayStart);
  if (day === "yesterday"){
    const ystStart = new Date(todayStart.getTime() - 86400000);
    return orders.filter(o => {
      const t = new Date(o.created_at);
      return t >= ystStart && t < todayStart;
    });
  }
  if (day === "7days"){
    const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);
    return orders.filter(o => new Date(o.created_at) >= weekAgo);
  }
  // explicit date "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)){
    const [y,m,d2] = day.split("-").map(Number);
    const dayStart = _startOfDayPKT(new Date(Date.UTC(y, m-1, d2, 12)));
    const dayEnd   = new Date(dayStart.getTime() + 86400000);
    return orders.filter(o => {
      const t = new Date(o.created_at);
      return t >= dayStart && t < dayEnd;
    });
  }
  return orders;
}

/* ------------------------------------------------------------------ */
/*  RENDER  ·  BOARD                                                  */
/* ------------------------------------------------------------------ */
function renderBoard({ flashId } = {}){
  const board = document.getElementById("board");
  board.innerHTML = "";

  const buckets = {};
  STATUSES.forEach(s => buckets[s.key] = []);

  // Apply day filter then sort by created_at desc
  const allOrders = filterByDay([...state.orders.values()])
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  for (const o of allOrders){
    (buckets[o.status] || (buckets[o.status] = [])).push(o);
  }

  STATUSES.forEach(s => {
    const list = buckets[s.key] || [];
    const col = document.createElement("section");
    col.className = "col";
    col.dataset.status = s.key;
    col.innerHTML = `
      <div class="col-head">
        <h3><span class="dot"></span>${s.label}</h3>
        <span class="ct">${list.length}</span>
      </div>
      <div class="col-body" data-body></div>
    `;
    const body = col.querySelector("[data-body]");
    if (!list.length){
      body.innerHTML = `<div class="empty-col">— EMPTY · drop here —</div>`;
    } else {
      list.forEach(o => body.appendChild(orderCard(o, flashId === o.id)));
    }

    // drag-and-drop drop target
    col.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("is-drop-target");
    });
    col.addEventListener("dragleave", e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("is-drop-target");
    });
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("is-drop-target");
      const orderId = e.dataTransfer.getData("text/plain");
      if (!orderId) return;
      const order = state.orders.get(orderId);
      if (!order) return;
      if (order.status === s.key) return; // dropped onto same column
      // Pickup orders skip out_for_delivery; bounce that
      if (order.order_type === "pickup" && s.key === "out_for_delivery"){
        toast("Pick-up orders skip OUT-FOR-DELIVERY · use READY → DELIVERED");
        return;
      }
      updateStatus(orderId, s.key);
    });

    board.appendChild(col);
  });

  // CANCELLED — read-only record at the end of the board (only if any)
  const cancelled = buckets["cancelled"] || [];
  if (cancelled.length){
    const col = document.createElement("section");
    col.className = "col col-cancelled";
    col.dataset.status = "cancelled";
    col.innerHTML = `
      <div class="col-head">
        <h3><span class="dot"></span>CANCELLED</h3>
        <span class="ct">${cancelled.length}</span>
      </div>
      <div class="col-body" data-body></div>
    `;
    const body = col.querySelector("[data-body]");
    cancelled.forEach(o => body.appendChild(orderCard(o, false)));
    board.appendChild(col);
  }

  updateAlarm();
}

function orderCard(o, flash){
  const card = document.createElement("article");
  card.className = "order-card" + (flash ? " is-flash" : "");
  if (flash) setTimeout(() => card.classList.add("is-new"), 10);
  const items = state.itemsByOrder.get(o.id) || [];
  const itemsLabel = items.length
    ? items.slice(0,3).map(i => `${i.quantity}× ${i.dish_name}`).join(", ")
      + (items.length > 3 ? `, +${items.length - 3} more` : "")
    : "(items loading…)";

  // figure out the next status for the one-click button
  const isPickup = o.order_type === "pickup";
  let next     = STATUSES.find(s => s.key === o.status)?.next;
  let nextHint = STATUSES.find(s => s.key === o.status)?.nextLabel;
  if (isPickup && PICKUP_NEXT[o.status]) { next = PICKUP_NEXT[o.status]; nextHint = "MARK PICKED UP"; }

  card.innerHTML = `
    ${next ? `<button class="oc-advance" data-next="${next}" title="${nextHint}" aria-label="${nextHint}">▸</button>` : ""}
    <div class="oc-top">
      <span class="oc-num">${o.order_number}</span>
      <span class="oc-time">${minutesAgo(o.created_at)}m ago</span>
    </div>
    <div class="oc-cust">${o.customer_name}</div>
    <div class="oc-meta">
      <span class="pill ${o.order_type}">${isPickup ? "PICK-UP" : "DELIVERY"}</span>
      ${o.area ? `<span class="pill">${o.area}</span>`:""}
      <span class="pill">${o.customer_phone}</span>
    </div>
    <div class="oc-items">${itemsLabel}</div>
    ${o.status === "cancelled" ? `<div class="oc-cancel-reason">✕ ${o.cancel_reason ? o.cancel_reason : "No reason given"}</div>` : ""}
    <div class="oc-foot">
      <span class="oc-total">${fmtPKR(o.total)}</span>
      ${o.status === "cancelled" ? `<span class="oc-cancel-when">${fmtTime(o.cancelled_at || o.created_at)}</span>` : ""}
    </div>
  `;

  // open modal on card body click — but not when clicking the advance btn
  card.addEventListener("click", e => {
    if (e.target.closest(".oc-advance")) return;
    openModal(o.id);
  });
  const advBtn = card.querySelector(".oc-advance");
  if (advBtn){
    advBtn.addEventListener("click", e => {
      e.stopPropagation();
      updateStatus(o.id, advBtn.dataset.next);
    });
  }

  // ---- drag and drop (cancelled orders are a read-only record) -----
  card.dataset.orderId = o.id;
  if (o.status === "cancelled") return card;
  card.draggable = true;
  card.addEventListener("dragstart", e => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", o.id);
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    document.querySelectorAll(".col.is-drop-target")
      .forEach(c => c.classList.remove("is-drop-target"));
  });

  return card;
}

/* ------------------------------------------------------------------ */
/*  RENDER  ·  STATS                                                  */
/* ------------------------------------------------------------------ */
function renderStats(){
  // stats follow the same day filter as the board
  const today = filterByDay([...state.orders.values()]);

  const validForRevenue = today.filter(o => o.status !== "cancelled");
  const revenue = validForRevenue.reduce((s,o) => s + Number(o.total||0), 0);
  const avg     = validForRevenue.length ? revenue / validForRevenue.length : 0;
  const delivered = today.filter(o => o.status === "delivered").length;
  const cancelled = today.filter(o => o.status === "cancelled").length;

  document.getElementById("statCount").textContent     = today.length;
  document.getElementById("statRevenue").textContent   = fmtPKR(revenue);
  document.getElementById("statAvg").textContent       = fmtPKR(avg);
  document.getElementById("statDelivered").textContent = delivered;
  document.getElementById("statCancelled").textContent = cancelled;
}

/* ------------------------------------------------------------------ */
/*  ORDER DETAIL MODAL                                                */
/* ------------------------------------------------------------------ */
async function openModal(id){
  const o = state.orders.get(id);
  if (!o) return;
  state.currentModalId = id;
  document.getElementById("orderModal").hidden = false;
  document.body.style.overflow = "hidden";

  document.getElementById("mOrderNum").textContent = o.order_number;
  let metaTxt = `Placed ${fmtTime(o.created_at)} · ${minutesAgo(o.created_at)} min ago`;
  if (o.status === "cancelled"){
    metaTxt += ` · ✕ CANCELLED ${o.cancelled_at ? fmtTime(o.cancelled_at) : ""}`
             + (o.cancel_reason ? ` — “${o.cancel_reason}”` : " — no reason given");
  }
  document.getElementById("mOrderMeta").textContent = metaTxt;
  const stEl = document.getElementById("mStatus");
  stEl.textContent = STATUS_LABEL[o.status] || o.status.toUpperCase();
  stEl.dataset.status = o.status;

  // customer
  document.getElementById("mCustomer").innerHTML = `
    <dt>Name</dt><dd>${o.customer_name}</dd>
    <dt>Phone</dt><dd><a href="tel:${o.customer_phone}">${o.customer_phone}</a></dd>
    <dt>Alt phone</dt><dd>${o.customer_phone_alt ? `<a href="tel:${o.customer_phone_alt}">${o.customer_phone_alt}</a>` : `<span class="none">—</span>`}</dd>
    <dt>Email</dt><dd>${o.customer_email || `<span class="none">—</span>`}</dd>
  `;

  // delivery
  const dt = document.getElementById("mDeliveryTitle");
  if (o.order_type === "pickup"){
    dt.textContent = "★ PICK-UP";
    document.getElementById("mDelivery").innerHTML = `
      <dt>Type</dt><dd>Customer pick-up</dd>
      <dt>Ready in</dt><dd>~${o.estimated_minutes} min</dd>
    `;
  } else {
    dt.textContent = "★ DELIVERY";
    const gpsLink = (o.delivery_gps_lat && o.delivery_gps_lng)
      ? `<a href="https://maps.google.com/?q=${o.delivery_gps_lat},${o.delivery_gps_lng}" target="_blank">📍 Open in Maps</a>`
      : "";
    document.getElementById("mDelivery").innerHTML = `
      <dt>Area</dt><dd>${o.area || `<span class="none">—</span>`}</dd>
      <dt>Address</dt><dd>${o.delivery_address || `<span class="none">—</span>`}</dd>
      <dt>Landmark</dt><dd>${o.delivery_landmark || `<span class="none">—</span>`}</dd>
      <dt>GPS</dt><dd>${gpsLink || `<span class="none">— no pin —</span>`}</dd>
      <dt>Map link</dt><dd>${o.delivery_map_link ? `<a href="${o.delivery_map_link}" target="_blank">Open</a>` : `<span class="none">—</span>`}</dd>
      <dt>Instructions</dt><dd>${o.delivery_instructions || `<span class="none">—</span>`}</dd>
      <dt>ETA</dt><dd>~${o.estimated_minutes} min</dd>
    `;
  }

  // items
  let items = state.itemsByOrder.get(id);
  if (!items){
    const { data: fetched } = await window.db.from("order_items")
      .select("*").eq("order_id", id);
    items = (fetched || []).sort((a,b) => (a.position??0) - (b.position??0));
    state.itemsByOrder.set(id, items);
  }
  document.getElementById("mItems").innerHTML = items.map(i => `
    <div class="m-item">
      <span class="q">×${i.quantity}</span>
      <span class="n">${i.dish_name}<small>${fmtPKR(i.unit_price)} each${i.variant?` · ${i.variant}`:""}${i.notes?` · ${i.notes}`:""}</small></span>
      <span class="p">${fmtPKR(i.line_total)}</span>
    </div>
  `).join("");

  // totals
  const taxPct = o.subtotal > 0 ? Math.round((Number(o.tax) / Number(o.subtotal)) * 100) : 15;
  document.getElementById("mTotals").innerHTML = `
    <div class="row"><span>Subtotal</span><span>${fmtPKR(o.subtotal)}</span></div>
    <div class="row"><span>Tax (${taxPct}%)</span><span>${fmtPKR(o.tax)}</span></div>
    <div class="row"><span>Delivery</span><span>${Number(o.delivery_fee)===0 ? "FREE" : fmtPKR(o.delivery_fee)}</span></div>
    ${Number(o.coupon_discount) > 0 ? `<div class="row"><span>Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}</span><span>−${fmtPKR(o.coupon_discount)}</span></div>` : ""}
    <div class="row grand"><span>TOTAL</span><span>${fmtPKR(o.total)}</span></div>
  `;

  // payment
  const payLabel = {
    "card-on-pickup":   "💳 Card at pick-up",
    "cash-on-pickup":   "Cash at pick-up",
    "cash-on-delivery": "Cash on delivery",
  }[o.payment_method] || "Cash on delivery";
  const isCard = o.payment_method === "card-on-pickup";
  document.getElementById("mPayment").innerHTML = `
    <dt>Method</dt><dd>${payLabel}</dd>
    ${isCard ? "" : `<dt>Change request</dt><dd>${o.change_request || `<span class="none">—</span>`}</dd>`}
  `;

  // customer-facing message
  const msgEl = document.getElementById("mCustomerMessage");
  msgEl.value = o.customer_message || "";
  document.getElementById("mMsgHint").textContent =
    o.customer_message ? "Visible on the customer's tracking page now." : "";
  const saveBtn = document.getElementById("mSaveMessage");
  saveBtn.onclick = () => saveCustomerMessage(o.id);

  // action buttons depend on current status & order type
  renderActions(o);
}

async function saveCustomerMessage(orderId){
  const btn  = document.getElementById("mSaveMessage");
  const msg  = document.getElementById("mCustomerMessage").value.trim();
  const hint = document.getElementById("mMsgHint");
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SAVING…";
  try {
    const { error } = await window.db.from("orders")
      .update({ customer_message: msg || null }).eq("id", orderId);
    if (error) throw error;
    hint.textContent = msg
      ? "✓ Message saved — customer will see it on the tracking page."
      : "✓ Message cleared.";
    toast("✓ Customer message saved");
    // update local cache
    const o = state.orders.get(orderId);
    if (o) state.orders.set(orderId, { ...o, customer_message: msg || null });
  } catch (err){
    toast("Save failed: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function renderActions(o){
  const wrap = document.getElementById("mActions");
  wrap.innerHTML = "";
  const isPickup = o.order_type === "pickup";

  let nextStatus = STATUSES.find(s => s.key === o.status)?.next;
  let nextLabel  = STATUSES.find(s => s.key === o.status)?.nextLabel;
  if (isPickup && PICKUP_NEXT[o.status]){
    nextStatus = PICKUP_NEXT[o.status];
    nextLabel  = "MARK PICKED UP";
  }

  if (nextStatus){
    const btn = document.createElement("button");
    btn.className = "act-go";
    btn.textContent = "▶ " + nextLabel;
    btn.addEventListener("click", () => updateStatus(o.id, nextStatus));
    wrap.appendChild(btn);
  }

  if (o.status !== "delivered" && o.status !== "cancelled"){
    const cancel = document.createElement("button");
    cancel.className = "act-cancel";
    cancel.textContent = "✕ CANCEL ORDER";
    cancel.addEventListener("click", () => {
      const why = prompt("Why are you cancelling this order? (optional)");
      if (why === null) return;
      updateStatus(o.id, "cancelled", why || null);
    });
    wrap.appendChild(cancel);
  }

  const printBtn = document.createElement("button");
  printBtn.className = "act-print";
  printBtn.textContent = "🖨 PRINT RECEIPT";
  printBtn.addEventListener("click", () => window.print());
  wrap.appendChild(printBtn);
}

function closeModal(){
  document.getElementById("orderModal").hidden = true;
  document.body.style.overflow = "";
  state.currentModalId = null;
}

/* ------------------------------------------------------------------ */
/*  STATUS UPDATE                                                     */
/* ------------------------------------------------------------------ */
async function updateStatus(id, newStatus, cancelReason = null){
  const update = { status: newStatus };
  const now = new Date().toISOString();
  if (newStatus === "accepted")         update.accepted_at  = now;
  if (newStatus === "cooking")          update.cooking_at   = now;
  if (newStatus === "ready")            update.ready_at     = now;
  if (newStatus === "out_for_delivery") update.out_at       = now;
  if (newStatus === "delivered")        update.delivered_at = now;
  if (newStatus === "cancelled")      { update.cancelled_at = now; update.cancel_reason = cancelReason; }

  const { error } = await window.db.from("orders").update(update).eq("id", id);
  if (error){
    toast("Update failed: " + error.message);
    return;
  }
  toast(`✓ ${STATUS_LABEL[newStatus] || newStatus.toUpperCase()}`);

  // optimistic local update (realtime will reconcile)
  const o = state.orders.get(id);
  if (o){ state.orders.set(id, { ...o, ...update }); }
  renderBoard();
  renderStats();
  // Action taken from the popup → close it so staff return to the board.
  if (state.currentModalId === id) closeModal();
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
  _toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

/* ------------------------------------------------------------------ */
/*  CLOCK                                                             */
/* ------------------------------------------------------------------ */
function startClock(){
  const el = document.getElementById("clockNow");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-PK",
      { hour: "numeric", minute: "2-digit", second: "2-digit" });
  };
  tick();
  setInterval(tick, 1000);

  // Refresh the "Xm ago" labels every 30s
  setInterval(() => {
    document.querySelectorAll(".oc-time").forEach((el,_) => {});
    renderBoard();
  }, 30000);
}

document.addEventListener("DOMContentLoaded", init);
