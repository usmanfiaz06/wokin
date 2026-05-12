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
};

/* ------------------------------------------------------------------ */
/*  AUTH                                                              */
/* ------------------------------------------------------------------ */
async function init(){
  // bind login form
  document.getElementById("loginForm").addEventListener("submit", onSignIn);
  document.getElementById("signOut").addEventListener("click", onSignOut);
  document.getElementById("modalClose").addEventListener("click", closeModal);
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
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("authErr");
  errEl.hidden = true;
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "SIGNING IN…";

  const { data, error } = await window.db.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = originalText;

  if (error){
    errEl.textContent = error.message || "Couldn't sign in. Check email & password.";
    errEl.hidden = false;
    return;
  }
  // onAuthStateChange listener will pick it up
}

async function onSignOut(){
  await window.db.auth.signOut();
}

function showAuth(){
  document.getElementById("authScreen").hidden = false;
  document.getElementById("appScreen").hidden = true;
}
async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden = false;
  document.getElementById("whoami").textContent = session.user.email;

  await refreshAll();
  subscribeRealtime();
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
    // ding (browser may block on first visit)
    try { playDing(); } catch(e){}
    toast(`★ NEW ORDER · ${payload.new.order_number}`);
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

function playDing(){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = "sine"; o.frequency.value = 880;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  o.start(); o.stop(ctx.currentTime + 0.55);
}

/* ------------------------------------------------------------------ */
/*  RENDER  ·  BOARD                                                  */
/* ------------------------------------------------------------------ */
function renderBoard({ flashId } = {}){
  const board = document.getElementById("board");
  board.innerHTML = "";

  const buckets = {};
  STATUSES.forEach(s => buckets[s.key] = []);

  // sort orders by created_at desc, partition by status
  const allOrders = [...state.orders.values()].sort(
    (a,b) => new Date(b.created_at) - new Date(a.created_at)
  );
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
      body.innerHTML = `<div class="empty-col">— EMPTY —</div>`;
    } else {
      list.forEach(o => body.appendChild(orderCard(o, flashId === o.id)));
    }
    board.appendChild(col);
  });
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
  card.innerHTML = `
    <div class="oc-top">
      <span class="oc-num">${o.order_number}</span>
      <span class="oc-time">${minutesAgo(o.created_at)}m ago</span>
    </div>
    <div class="oc-cust">${o.customer_name}</div>
    <div class="oc-meta">
      <span class="pill ${o.order_type}">${o.order_type === "pickup" ? "PICK-UP" : "DELIVERY"}</span>
      ${o.area ? `<span class="pill">${o.area}</span>`:""}
      <span class="pill">${o.customer_phone}</span>
    </div>
    <div class="oc-items">${itemsLabel}</div>
    <div class="oc-foot">
      <span class="oc-total">${fmtPKR(o.total)}</span>
      <span class="oc-arrow">›</span>
    </div>
  `;
  card.addEventListener("click", () => openModal(o.id));
  return card;
}

/* ------------------------------------------------------------------ */
/*  RENDER  ·  STATS                                                  */
/* ------------------------------------------------------------------ */
function renderStats(){
  // today (Asia/Karachi)
  const offsetMs = 5 * 3600 * 1000; // PKT is UTC+5, no DST
  const now = new Date();
  const pktNow = new Date(now.getTime() + offsetMs);
  pktNow.setUTCHours(0,0,0,0);
  const startOfDay = new Date(pktNow.getTime() - offsetMs);

  const today = [...state.orders.values()].filter(
    o => new Date(o.created_at) >= startOfDay
  );

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
  document.getElementById("mOrderMeta").textContent =
    `Placed ${fmtTime(o.created_at)} · ${minutesAgo(o.created_at)} min ago`;
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
  document.getElementById("mTotals").innerHTML = `
    <div class="row"><span>Subtotal</span><span>${fmtPKR(o.subtotal)}</span></div>
    <div class="row"><span>Tax (15%)</span><span>${fmtPKR(o.tax)}</span></div>
    <div class="row"><span>Delivery</span><span>${Number(o.delivery_fee)===0 ? "FREE" : fmtPKR(o.delivery_fee)}</span></div>
    ${Number(o.coupon_discount) > 0 ? `<div class="row"><span>Coupon (${o.coupon_code})</span><span>−${fmtPKR(o.coupon_discount)}</span></div>` : ""}
    <div class="row grand"><span>TOTAL</span><span>${fmtPKR(o.total)}</span></div>
  `;

  // payment
  document.getElementById("mPayment").innerHTML = `
    <dt>Method</dt><dd>Cash on delivery</dd>
    <dt>Change request</dt><dd>${o.change_request || `<span class="none">—</span>`}</dd>
  `;

  // action buttons depend on current status & order type
  renderActions(o);
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
  if (state.currentModalId === id) openModal(id);
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
