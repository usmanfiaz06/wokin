/* =====================================================================
   WOK!N  ·  QR DEALS PAGE  ·  deals.js
   ---------------------------------------------------------------------
   Flow:
     1. Guest scans the table QR  →  lands on the gate (name + mobile)
     2. Details are written to public.qr_leads  →  Admin → GUESTS
     3. The offers unlock. The details are remembered on the device, so a
        returning guest skips straight to the deals.

   The deals themselves are never gated behind a *successful* insert —
   if Supabase is down or the migration hasn't been run yet, the guest
   still sees the offers and the lead is queued for the next visit.
   ===================================================================== */

const LEAD_KEY    = "wokin_qr_lead";      // the saved guest on this device
const PENDING_KEY = "wokin_qr_pending";   // lead that failed to save, retried later
const SOURCE      = "qr-deals";
const SAVE_TIMEOUT_MS = 3500;             // never hold the offers hostage

/* What a guest sends when they tap "Share on WhatsApp". The page's own
   URL is appended so whoever receives it lands on this same page. */
const SHARE_TEXT = [
  "Hey! Check out the amazing deals I've found at WOK!N \u2014 the finest pan-Asian restaurant in Gulberg Greens \uD83D\uDD25",
  "",
  "Flat 20% off in weekend Golden Hour, and up to 50% off on bank cards.",
  "",
  "",
].join("\n");

/* Offer windows, in Pakistan Standard Time.
   days: 0=Sun … 6=Sat · from/to are 24h hours. */
const WINDOWS = [
  { id:"dealGolden", label:"GOLDEN HOUR", days:[0,6], from:12, to:16 },
];

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* The customer site keeps its cart here. Same origin, so a deal added
   from this page is already waiting when the guest lands on the menu. */
const CART_KEY       = "wokin_order_state_v1";
const DISH_PHOTO_REV = "2026-08-20.2";
const FALLBACK_IMG   = "/Assorted_Chinese_food_set.jpg.webp";

const fmtPKR = n => "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-PK");

/* ------------------------------------------------------------------ */
/*  BOOT                                                              */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const form  = document.getElementById("leadForm");
  const phone = document.getElementById("fPhone");

  form.addEventListener("submit", onSubmit);
  phone.addEventListener("input", onPhoneInput);

  // clear the error state as soon as the guest starts fixing a field
  ["fName","fPhone"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => clearFieldError(id));
  });

  flushPendingLead();          // retry a lead that couldn't be saved last time

  const saved = readSavedLead();
  if (saved) showDeals(saved, { instant:true });
});

/* ------------------------------------------------------------------ */
/*  GATE                                                              */
/* ------------------------------------------------------------------ */
async function onSubmit(e){
  e.preventDefault();

  const name = document.getElementById("fName").value.trim();
  const rawPhone = document.getElementById("fPhone").value;

  let ok = true;
  if (name.length < 2){
    setFieldError("fName", "Please tell us your name."); ok = false;
  }
  const phone = normalizePhone(rawPhone);
  if (!phone){
    setFieldError("fPhone", "Enter a valid mobile, e.g. 300 1234567."); ok = false;
  }
  if (!ok) return;

  const lead = { name, phone, source: SOURCE };

  const btn = document.getElementById("unlockBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "UNLOCKING…";

  const saved = await saveLead(lead);
  if (!saved) queuePendingLead(lead);      // never block the guest on our DB

  rememberLead(lead);
  showDeals(lead);
}

function setFieldError(id, msg){
  const input = document.getElementById(id);
  const err   = document.getElementById("err" + id.slice(1));   // fName → errName
  input.classList.add("is-bad");
  if (err){ err.textContent = msg; err.hidden = false; }
}
function clearFieldError(id){
  const input = document.getElementById(id);
  const err   = document.getElementById("err" + id.slice(1));
  input.classList.remove("is-bad");
  if (err) err.hidden = true;
  document.getElementById("formErr").hidden = true;
}

/* Pretty-print the local part as it's typed: 300 1234567.
   The field already shows "+92", so a pasted 0300…/+92300… is trimmed
   down to the 10-digit local number instead of doubling the prefix. */
function onPhoneInput(e){
  let d = e.target.value.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length > 10) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 10);
  e.target.value = d.length > 3 ? d.slice(0,3) + " " + d.slice(3) : d;
}

/* Accepts 03001234567 · 3001234567 · +923001234567 · 923001234567
   Returns +923001234567, or null if it isn't a Pakistani mobile. */
function normalizePhone(raw){
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  else if (d.startsWith("0"))  d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "+92" + d : null;
}

/* ------------------------------------------------------------------ */
/*  LEAD STORAGE                                                      */
/* ------------------------------------------------------------------ */
async function saveLead(lead){
  if (!window.db) return false;
  try {
    // No .select() on purpose — anon has INSERT rights only, so the guest
    // list can't be read back from the browser.
    const insert = window.db.from("qr_leads").insert({
      name:  lead.name,
      phone: lead.phone,
      // The column is NOT NULL on tables created before we stopped
      // asking for an email; an empty string keeps the insert valid
      // without needing a migration first.
      email: lead.email || "",
      source: lead.source || SOURCE,
      user_agent: (navigator.userAgent || "").slice(0, 300),
    });
    // On restaurant wifi the request can stall rather than fail, and a
    // guest staring at a spinner is worse than a lead saved a visit late.
    // Give up waiting after a few seconds; the caller queues it for retry.
    const { error } = await withTimeout(insert, SAVE_TIMEOUT_MS);
    if (error) throw error;
    return true;
  } catch (err){
    console.warn("[wokin/deals] lead not saved:", err.message || err);
    return false;
  }
}

function withTimeout(promise, ms){
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("save timed out")), ms); }),
  ]);
}

function rememberLead(lead){
  try { localStorage.setItem(LEAD_KEY, JSON.stringify(lead)); } catch(e){}
}
function readSavedLead(){
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    if (!raw) return null;
    const lead = JSON.parse(raw);
    return lead && lead.name ? lead : null;
  } catch(e){ return null; }
}
function queuePendingLead(lead){
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(lead)); } catch(e){}
}
async function flushPendingLead(){
  let lead;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    lead = JSON.parse(raw);
  } catch(e){ return; }
  if (!lead || !lead.phone) return;
  if (await saveLead(lead)){
    try { localStorage.removeItem(PENDING_KEY); } catch(e){}
  }
}

/* ------------------------------------------------------------------ */
/*  DEALS                                                             */
/* ------------------------------------------------------------------ */
function showDeals(lead, opts = {}){
  document.getElementById("gateScreen").hidden = true;
  const screen = document.getElementById("dealsScreen");
  screen.hidden = false;
  if (opts.instant) screen.style.animation = "none";

  const first = String(lead.name || "").trim().split(/\s+/)[0];
  document.getElementById("helloLine").textContent =
    first ? `Hey ${first} — here's what's on.` : "Here's what's on.";

  window.scrollTo(0, 0);

  setShareLink();
  renderDeliveryDeals();
  bindTabs();
  syncCartBar();
  markLiveOffer();
  setInterval(markLiveOffer, 60000);   // keep the "ON NOW" badge honest

  loadBanners();
}

/* ---- share on whatsapp ---- */
function setShareLink(){
  const link = document.getElementById("waShare");
  if (!link) return;
  // Share the page the guest is actually on, so the friend who opens it
  // gets the live offers (and signs up on the same gate).
  const url  = location.origin + location.pathname.replace(/\.html$/, "");
  const text = SHARE_TEXT + url;
  link.href = "https://wa.me/?text=" + encodeURIComponent(text);
}

/* ---- which offer is running right now (Pakistan time) ---- */
function pktNow(){
  // Reads the wall clock in Asia/Karachi no matter where the phone is set.
  return new Date(new Date().toLocaleString("en-US", { timeZone:"Asia/Karachi" }));
}

function markLiveOffer(){
  const now  = pktNow();
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  let live = null;
  WINDOWS.forEach(w => {
    const on = w.days.includes(day) && mins >= w.from * 60 && mins < w.to * 60;
    const card  = document.getElementById(w.id);
    const badge = card && card.querySelector(".deal-live");
    if (card)  card.classList.toggle("is-live", on);
    if (badge) badge.hidden = !on;
    if (on) live = w;
  });

  const pill = document.getElementById("livePill");
  const text = document.getElementById("liveText");
  if (live){
    pill.classList.remove("is-off");
    text.textContent = `${live.label} · ON RIGHT NOW TILL ${fmtHour(live.to)}`;
  } else {
    const next = nextWindow(day, mins);
    pill.classList.add("is-off");
    text.textContent = next
      ? `NEXT · ${next.w.label} ${next.whenLabel}`
      : "BANK CARD OFFERS RUNNING ALL WEEK";
  }
  pill.hidden = false;
}

/* Nearest upcoming window, searching today first then the next 7 days. */
function nextWindow(day, mins){
  let best = null;
  for (let ahead = 0; ahead <= 7; ahead++){
    const d = (day + ahead) % 7;
    WINDOWS.forEach(w => {
      if (!w.days.includes(d)) return;
      const startMins = ahead * 1440 + w.from * 60;
      const nowMins   = mins;
      if (startMins <= nowMins) return;            // already started / passed
      if (!best || startMins < best.startMins){
        best = { w, startMins, whenLabel: whenLabel(ahead, d, w) };
      }
    });
    if (best) break;                                // earliest day wins
  }
  return best;
}

function whenLabel(ahead, dayIndex, w){
  const at = fmtHour(w.from);
  if (ahead === 0) return `TODAY AT ${at}`;
  if (ahead === 1) return `TOMORROW AT ${at}`;
  return `${DAY_NAMES[dayIndex].toUpperCase()} AT ${at}`;
}

function fmtHour(h){
  const suffix = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${suffix}`;
}

/* ------------------------------------------------------------------ */
/*  DELIVERY DEALS                                                    */
/* ------------------------------------------------------------------ */
async function renderDeliveryDeals(){
  const list = document.getElementById("ddList");
  if (!list) return;
  // Which dishes staff allow in the dropdowns — read before building them.
  await loadDealDishOptions(window.db);
  list.innerHTML = "";
  DELIVERY_DEALS.forEach(d => list.appendChild(dealCard(d)));
  loadDishPhotos();               // swap in the real photos once they arrive
}

function dealCard(deal){
  const card = document.createElement("article");
  card.className = "dd" + (deal.popular ? " is-popular" : "");

  const fig = document.createElement("div");
  fig.className = "dd-img";
  fig.dataset.dish = slugifyDish(deal.hero);
  fig.style.backgroundImage = `url("${FALLBACK_IMG}")`;
  if (deal.popular){
    const flag = document.createElement("span");
    flag.className = "dd-flag";
    flag.textContent = "★ MOST POPULAR";
    fig.appendChild(flag);
  }
  const serves = document.createElement("span");
  serves.className = "dd-serves";
  serves.textContent = deal.serves;
  fig.appendChild(serves);
  card.appendChild(fig);

  const body = document.createElement("div");
  body.className = "dd-body";

  const h4 = document.createElement("h4");
  h4.textContent = deal.name;
  body.appendChild(h4);

  const ul = document.createElement("ul");
  ul.className = "dd-items";
  deal.items.forEach(item => {
    const li = document.createElement("li");
    if (typeof item === "string"){
      li.textContent = item;                   // textContent = XSS-safe
    } else {
      // "Half chicken dish" doesn't say which one — let the guest choose.
      li.className = "dd-pick";
      const lbl = document.createElement("span");
      lbl.className = "dd-pick-lbl";
      lbl.textContent = item.label;
      const sel = document.createElement("select");
      sel.className = "dd-pick-sel is-empty";
      sel.setAttribute("aria-label", item.label);
      // Nothing is chosen for the guest — they pick, and that unlocks
      // the add button.
      const ph = document.createElement("option");
      ph.value = ""; ph.textContent = "Select dish";
      sel.appendChild(ph);
      pickOptions(item.pick).forEach(name => {
        const o = document.createElement("option");
        o.value = o.textContent = name;
        sel.appendChild(o);
      });
      sel.value = "";
      sel.addEventListener("change", () => {
        sel.classList.toggle("is-empty", !sel.value);
        syncAddButton(card);
      });
      li.appendChild(lbl); li.appendChild(sel);
    }
    ul.appendChild(li);
  });
  body.appendChild(ul);

  if (deal.note){
    const note = document.createElement("p");
    note.className = "dd-note";
    note.textContent = deal.note;
    body.appendChild(note);
  }

  const foot = document.createElement("div");
  foot.className = "dd-foot";

  const price = document.createElement("div");
  price.className = "dd-price";
  const b = document.createElement("b");
  b.textContent = fmtPKR(deal.price);
  const tax = document.createElement("span");
  tax.textContent = "+ tax";
  price.appendChild(b); price.appendChild(tax);
  foot.appendChild(price);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dd-add";
  btn.textContent = "ADD TO ORDER";
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    addDealToCart(deal, card);
    btn.classList.add("is-added");
    btn.textContent = "ADDED ✓";
    setTimeout(() => { btn.classList.remove("is-added"); syncAddButton(card); }, 1600);
  });
  foot.appendChild(btn);

  body.appendChild(foot);
  card.appendChild(body);
  syncAddButton(card);
  return card;
}

/* A deal can't be added until every "which dish?" has an answer. */
function syncAddButton(card){
  const btn = card.querySelector(".dd-add");
  if (!btn) return;
  const pending = [...card.querySelectorAll(".dd-pick-sel")].some(s => !s.value);
  btn.disabled = pending;
  if (!btn.classList.contains("is-added")){
    btn.textContent = pending ? "SELECT DISHES" : "ADD TO ORDER";
  }
}

/* Same slug rule the menu uses, so a deal's hero dish lines up with the
   photo the admin set for it. */
function slugifyDish(s){
  return String(s).toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* menu_overrides holds dish_slug → image_path for every photographed
   dish. One read gives every card its picture. */
async function loadDishPhotos(){
  if (!window.db) return;
  try {
    const { data, error } = await window.db.from("menu_overrides")
      .select("dish_slug,image_path");
    if (error) throw error;

    const bySlug = new Map();
    (data || []).forEach(r => { if (r.image_path) bySlug.set(r.dish_slug, r.image_path); });

    document.querySelectorAll(".dd-img[data-dish]").forEach(el => {
      const path = bySlug.get(el.dataset.dish);
      if (!path) return;
      // Vercel holds the copies migrated off Supabase; anything uploaded
      // since lives only in Supabase storage. Try both, same order the
      // menu does, and keep the food fallback if neither loads.
      const base = (window.SUPABASE_URL || "").replace(/\/$/, "");
      const candidates = [
        `/dish-uploads/${path}?v=${DISH_PHOTO_REV}`,
        `${base}/storage/v1/object/public/dish-images/${path}`,
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= candidates.length) return;
        const url = candidates[i++];
        const probe = new Image();
        probe.onload  = () => { el.style.backgroundImage = `url("${url}")`; };
        probe.onerror = tryNext;
        probe.src = url;
      };
      tryNext();
    });
  } catch (err){
    console.warn("[wokin/deals] dish photos unavailable:", err.message || err);
  }
}

/* ------------------------------------------------------------------ */
/*  CART  —  writes into the customer site's own basket                */
/* ------------------------------------------------------------------ */
function readCartState(){
  try {
    const raw = localStorage.getItem(CART_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && Array.isArray(s.cart)) return s;
  } catch(e){}
  // Matches the shape order.js starts from when there's nothing stored.
  return { type:null, area:null, cart:[], coupon:null, couponDiscount:0,
           couponLabel:"", payment:"cash" };
}

function addDealToCart(deal, card){
  const state = readCartState();

  // The chosen dishes ride along in `variant` — that's the field the
  // order actually stores and the kitchen ticket prints. `desc` isn't.
  const picks = card
    ? [...card.querySelectorAll(".dd-pick-sel")].map(s => s.value).filter(Boolean)
    : [];
  const variant = picks.length ? picks.join(" · ") : null;

  // Two different sets of picks are two different lines, not one line
  // of quantity two.
  const id = "deal::" + deal.id + (picks.length ? "::" + picks.join("|") : "");

  const line = state.cart.find(c => c.id === id);
  if (line) line.qty += 1;
  else state.cart.push({
    id, name: deal.name, desc: "🛵 Delivery deal · " + deal.serves, variant,
    image: FALLBACK_IMG.replace(/^\//, ""), price: deal.price, qty: 1, customId: null,
  });

  // A changed cart invalidates any coupon the order page had validated,
  // same as adding a combo there does.
  if (state.coupon){ state.coupon = null; state.couponDiscount = 0; state.couponLabel = ""; }

  try { localStorage.setItem(CART_KEY, JSON.stringify(state)); }
  catch(e){ /* private mode — the bar just won't persist */ }

  syncCartBar();
}

/* The bar only counts what this page added; the rest of the basket is
   the order page's business. */
function syncCartBar(){
  const bar = document.getElementById("cartBar");
  if (!bar) return;
  const deals = readCartState().cart.filter(c => String(c.id).startsWith("deal::"));
  const qty   = deals.reduce((n, c) => n + (c.qty || 0), 0);
  document.body.classList.toggle("has-cart-bar", qty > 0);
  if (!qty){ bar.hidden = true; return; }

  const total = deals.reduce((n, c) => n + (c.price || 0) * (c.qty || 0), 0);
  document.getElementById("cartBarCount").textContent = qty;
  document.getElementById("cartBarLine").textContent  = qty === 1 ? "1 deal added" : qty + " deals added";
  document.getElementById("cartBarSum").textContent   = fmtPKR(total) + " + tax";
  bar.hidden = false;
}

/* ------------------------------------------------------------------ */
/*  SECTION TABS  —  jump links, not filters                          */
/* ------------------------------------------------------------------ */
function bindTabs(){
  const bar  = document.getElementById("tabs");
  const tabs = [...document.querySelectorAll(".tab")];
  if (!bar || !tabs.length) return;

  tabs.forEach(t => t.addEventListener("click", e => {
    e.preventDefault();
    const target = document.getElementById(t.dataset.target);
    if (!target) return;
    // Land the heading just under the sticky bar rather than behind it.
    const y = window.scrollY + target.getBoundingClientRect().top - bar.offsetHeight - 12;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }));

  // Highlight whichever section the guest has actually scrolled to, so
  // the tabs stay honest while the page runs on past the discounts.
  let ticking = false;
  const spy = () => {
    ticking = false;
    const line = bar.getBoundingClientRect().bottom + 16;
    let active = tabs[0];
    tabs.forEach(t => {
      const sec = document.getElementById(t.dataset.target);
      if (sec && sec.getBoundingClientRect().top <= line) active = t;
    });
    tabs.forEach(t => t.classList.toggle("is-on", t === active));
  };
  window.addEventListener("scroll", () => {
    if (!ticking){ ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  spy();
}

/* ---- the website's scrolling promo banners ---- */
async function loadBanners(){
  if (!window.db) return;
  try {
    const { data, error } = await window.db.from("promo_banners")
      .select("*").eq("is_active", true).order("position", { ascending:true });
    if (error) throw error;

    const messages = (data || []).map(b => b.message).filter(Boolean);
    if (!messages.length) return;

    const track = document.getElementById("tickerTrack");
    track.innerHTML = "";
    // Printed twice so the -50% loop is seamless.
    [...messages, ...messages].forEach(msg => {
      const span = document.createElement("span");
      span.textContent = "★ " + msg;
      track.appendChild(span);
    });
    document.getElementById("ticker").hidden = false;
  } catch (err){
    console.warn("[wokin/deals] banners unavailable:", err.message || err);
  }
}
