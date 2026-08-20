/* =====================================================================
   WOK!N  ·  ORDER EXPERIENCE  ·  order.js
   ---------------------------------------------------------------------
   - Location modal (delivery / pickup + area picker with GPS fallback)
   - Sticky header (location chip is clickable to re-open the modal)
   - Menu render from menu-data.js + dish-images.js
   - Cart drawer (persisted in localStorage)
   - Free-delivery progress, 15% tax, Rs.100 delivery, Rs.1800 threshold
   - Checkout sheet with validation + COD + coupon
   - Order confirmation
   ---------------------------------------------------------------------
   Google Maps is intentionally OFF. We capture the customer's GPS via
   the browser (free, no API key) and accept an optional pasted Maps
   link — both get attached to the order for the rider.
   To enable an embedded map later: set GOOGLE_MAPS_API_KEY below to
   your Maps Embed API key.
   ===================================================================== */

const GOOGLE_MAPS_API_KEY = ""; // leave empty — GPS capture works without it

const DELIVERY_AREAS = [
  "Gulberg Greens",
  "Ghauri Town",
  "Naval Anchorage",
  "Koral Town",
  "Soan Garden",
  "CBR Town",
  "PWD",
  "Pakistan Town",
  "Airport Housing Society",
  "Khanna Pul",
];

const TAX_RATE             = 0.15;
const TAX_RATE_PICKUP_CARD = 0.05;   // pick-up paid by card → reduced tax
const DELIVERY_FEE   = 100;
const FREE_THRESHOLD = 1800;
const ETA_MIN        = 45;

// Pick-up: single branch — we just show the address + maps link (no area picker)
const PICKUP_BRANCH_LABEL = "WOK!N — Empire Plaza, Gulberg Greens";
const PICKUP_MAPS_URL     = "https://maps.app.goo.gl/Tg4H33Dk8HezMsHm7";

// Coupons are validated server-side via the validate_coupon RPC.
// Active auto-apply promotions are fetched on startup and applied
// to the dish cards (crossed-out original / discounted price).

const fmtPKR = n => "Rs. " + Math.round(n).toLocaleString("en-PK");

// Apply a dish photo URL to a .img element, with a guaranteed Asian-food
// fallback if the per-dish file isn't uploaded yet.
function applyDishBg(el, url, altUrl){
  if (!el) return;
  const generic = window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp";
  // Paint the food fallback first so a broken/missing photo never shows the
  // bare "initial letter" placeholder…
  el.style.backgroundImage = `url("${generic}")`;
  // …then try each candidate in order (Vercel copy → Supabase → generic),
  // showing the first that actually loads.
  const candidates = [url, altUrl].filter(u => u && u !== generic);
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const u = candidates[i++];
    const probe = new Image();
    probe.onload  = () => { el.style.backgroundImage = `url("${u}")`; };
    probe.onerror = tryNext;
    probe.src = u;
  };
  tryNext();
}

/* ------------------------------------------------------------------ */
/*  CUSTOM DIALOG  (replaces native browser alert)                     */
/* ------------------------------------------------------------------ */
function showDialog({ icon = "🔔", title = "Notice", body = "", ok = "GOT IT", onOk } = {}) {
  const wrap  = document.getElementById("wkDialogWrap");
  if (!wrap) { alert(body); if (onOk) onOk(); return; }
  document.getElementById("wkDialogIcon").textContent  = icon;
  document.getElementById("wkDialogTitle").textContent = title;
  document.getElementById("wkDialogBody").textContent  = body;
  document.getElementById("wkDialogOk").textContent    = ok;
  wrap.hidden = false;
  document.body.style.overflow = "hidden";
  const btn = document.getElementById("wkDialogOk");
  const close = () => {
    wrap.hidden = true;
    document.body.style.overflow = "";
    btn.removeEventListener("click", close);
    if (onOk) onOk();
  };
  btn.addEventListener("click", close);
}

/* ------------------------------------------------------------------ */
/*  STATE (persisted in localStorage)                                  */
/* ------------------------------------------------------------------ */
const LS_KEY = "wokin_order_state_v1";
const state = loadState() || {
  type: null,        // 'delivery' | 'pickup'
  area: null,        // string or null
  cart: [],          // { id, name, desc, image, price, qty, customId }
  coupon: null,
  couponDiscount: 0, // Rs value validated by server
  couponLabel: "",
  payment: "cash",   // 'cash' | 'card' (card only offered for pick-up)
};
// Migrate older state shapes
if (state.couponDiscount === undefined) state.couponDiscount = 0;
if (state.couponLabel === undefined)    state.couponLabel = "";
if (state.payment === undefined)        state.payment = "cash";

function saveState(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch(e){ /* ignore */ }
}
function loadState(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
  catch(e){ return null; }
}

/* ------------------------------------------------------------------ */
/*  STARTUP                                                           */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  populateAreaSelect();
  bindLocationModal();
  bindTopBar();
  bindCart();
  bindSearch();
  bindCheckout();

  // Apply live menu overrides (availability / pricing) before render
  await loadMenuOverrides();
  await loadCustomDishes();
  await loadAutoPromos();
  await loadBusinessHours();
  startStoreStatusClock();

  renderMenu();
  renderPopular();
  syncBarLocation();
  recalcCart();
  subscribeMenuOverrides();
  loadDeals();
  loadCombos();

  // User lands on the site freely; pop-up rises 1.5s later
  // (only the very first time — once they've picked, we skip).
  // Pick-up has no area, so type alone counts as "chosen".
  const hasChosen = state.type === "pickup" || (state.type && state.area);
  if (!hasChosen) {
    setTimeout(openLocModal, 1500);
  }
});


/* ==================================================================
   DEALS MARQUEE  (admin-managed promo banners)
=================================================================== */
async function loadDeals(){
  const bar   = document.getElementById("dealsBar");
  const track = document.getElementById("dealsTrack");
  const brand = document.getElementById("brandStrip");
  if (!bar || !track || !window.db) return;
  const showBrand = () => { if (brand) brand.style.display = ""; bar.hidden = true; };
  try {
    const { data, error } = await window.db.from("promo_banners")
      .select("message,position").eq("is_active", true).order("position", { ascending: true });
    if (error) throw error;
    const msgs = (data || []).map(d => (d.message || "").trim()).filter(Boolean);
    if (!msgs.length){ showBrand(); return; }
    track.innerHTML = "";
    // duplicate the set so the marquee loops seamlessly (see -50% keyframe)
    for (let pass = 0; pass < 2; pass++){
      msgs.forEach(m => {
        const s = document.createElement("span");
        s.textContent = "🔥 " + m;          // textContent = safe from HTML injection
        track.appendChild(s);
      });
    }
    // Only one scrolling bar at a time — hide the brand ticker while a deal runs
    if (brand) brand.style.display = "none";
    bar.hidden = false;
  } catch(e){
    showBrand();   // table may not exist yet — keep the brand ticker
  }
}

/* Dish photos live at /dish-uploads/<image_path> and are served
   `immutable` for a year, so a re-shoot at the same path would keep
   showing the old picture. Bump this whenever the photo set is
   replaced — it changes the URL without touching the database. */
const DISH_PHOTO_REV = "2026-08-20.2";
function dishPhotoUrl(path){
  return path ? `/dish-uploads/${path}?v=${DISH_PHOTO_REV}` : null;
}

/* ==================================================================
   COMBO DEALS  (admin-managed bundle offers)
=================================================================== */
function supabaseStorageUrl(path){
  if (!path) return null;
  return `${(window.SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1/object/public/dish-images/${path}`;
}
function comboImageUrl(c){ return c.image_path ? supabaseStorageUrl(c.image_path) : null; }

async function loadCombos(){
  const sec  = document.getElementById("combosSection");
  const grid = document.getElementById("combosGrid");
  if (!sec || !grid || !window.db) return;
  try {
    const { data, error } = await window.db.from("combos")
      .select("*").eq("is_active", true).order("position", { ascending: true });
    if (error) throw error;
    const combos = data || [];
    if (!combos.length){ sec.hidden = true; return; }
    grid.innerHTML = "";
    combos.forEach(c => grid.appendChild(comboCard(c)));
    sec.hidden = false;
  } catch(e){ sec.hidden = true; }   // table may not exist yet
}

function comboCard(combo){
  const card = document.createElement("article");
  card.className = "combo-card";
  const img = document.createElement("div"); img.className = "img";
  const pad = document.createElement("div"); pad.className = "pad";
  const h3  = document.createElement("h3"); h3.textContent = combo.name;
  pad.appendChild(h3);
  if (combo.description){ const p = document.createElement("p"); p.textContent = combo.description; pad.appendChild(p); }
  const foot = document.createElement("div"); foot.className = "foot";
  const price = document.createElement("b"); price.textContent = fmtPKR(combo.price);
  const btn = document.createElement("button"); btn.className = "add-btn"; btn.textContent = "ADD +";
  btn.addEventListener("click", () => {
    addComboToCart(combo);
    card.classList.add("is-flash");
    setTimeout(() => card.classList.remove("is-flash"), 600);
  });
  foot.appendChild(price); foot.appendChild(btn);
  pad.appendChild(foot);
  card.appendChild(img); card.appendChild(pad);
  applyDishBg(img, comboImageUrl(combo));
  return card;
}

function addComboToCart(combo){
  const id = "combo::" + combo.id;
  const existing = state.cart.find(c => c.id === id);
  if (existing){ existing.qty += 1; }
  else {
    state.cart.push({
      id, name: combo.name, desc: "🍱 Combo deal", variant: null,
      image: comboImageUrl(combo) || (window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp"),
      price: Number(combo.price) || 0, qty: 1, customId: null,
    });
  }
  if (state.coupon){ state.couponDiscount = 0; state.coupon = null; state.couponLabel = ""; }
  saveState();
  recalcCart();
  bumpCartIcon();
  if (typeof fbq === "function"){
    fbq("track", "AddToCart", { value: Math.round(Number(combo.price)||0), currency: "PKR",
      contents: [{ id: "combo:" + combo.name, quantity: 1 }], num_items: 1 });
  }
}

/* ==================================================================
   LIVE MENU OVERRIDES
=================================================================== */
const menuOverrides = new Map();   // dish_slug -> override row

async function loadMenuOverrides(){
  if (!window.db || !window.slugifyDish) return;
  try {
    const { data, error } = await window.db.from("menu_overrides").select("*");
    if (error) throw error;
    menuOverrides.clear();
    (data || []).forEach(row => menuOverrides.set(row.dish_slug, row));
    applyOverridesToMenu();
  } catch (e){
    console.warn("[wokin] menu overrides fetch failed (using static menu):", e.message);
  }
}

function applyOverridesToMenu(){
  if (typeof MENU_DATA === "undefined" || !window.slugifyDish) return;
  MENU_DATA.forEach(cat => {
    cat.items.forEach(d => {
      const slug = window.slugifyDish(d.name);
      const o = menuOverrides.get(slug);
      d._available = o ? o.is_available !== false : true;
      d._hidden    = o ? o.is_hidden === true : false;   // fully hidden from customers
      d._popular   = o ? o.is_popular === true : false;  // show in Crowd Favourites
      d._price     = (o && o.price_override      != null) ? Number(o.price_override)      : d.price;
      d._priceHalf = (o && o.price_half_override != null) ? Number(o.price_half_override) : d.priceHalf;
      d._priceFull = (o && o.price_full_override != null) ? Number(o.price_full_override) : d.priceFull;
      d._desc      = (o && o.description_override) ? o.description_override : d.desc;
      d._pcs       = (o && o.pcs_override)         ? o.pcs_override         : d.pcs;
      // custom photo set from admin → serve the migrated copy from Vercel
      // (cheap bandwidth); keep the Supabase URL as a fallback for any photo
      // uploaded after the migration.
      d._imageUrl = (o && o.image_path) ? dishPhotoUrl(o.image_path) : null;
      d._imageAlt = (o && o.image_path) ? supabaseStorageUrl(o.image_path)  : null;
    });
  });
}

/* ==================================================================
   BUSINESS HOURS  (PKT, UTC+5, no DST)
=================================================================== */
const storeStatus = {
  hours:    [],     // 7 business_hours rows
  settings: null,   // app_settings row
};

const _PKT_DAYS_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const _PKT_DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function _pktDate(){ return new Date(Date.now() + 5 * 3600 * 1000); }
function _pktDay(){  return _pktDate().getUTCDay(); }
function _pktMinutes(){ const d = _pktDate(); return d.getUTCHours() * 60 + d.getUTCMinutes(); }

function _fmt12(time /* "HH:MM(:SS)?" */){
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m === "00" ? `${h} ${ampm}` : `${h}:${m} ${ampm}`;
}

async function loadBusinessHours(){
  if (!window.db) return;
  try {
    const [{ data: h }, { data: s }] = await Promise.all([
      window.db.from("business_hours").select("*").order("day_of_week"),
      window.db.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    storeStatus.hours    = h || [];
    storeStatus.settings = s || { force_closed:false, closed_message:null };
    applyStoreStatus();
  } catch (e){
    console.warn("[wokin] business-hours fetch failed:", e.message);
  }
}

function evaluateStoreStatus(){
  if (!storeStatus.hours.length){
    return { open: true, why: "loading" };
  }
  if (storeStatus.settings?.force_closed){
    return {
      open: false,
      why:  "force",
      message: storeStatus.settings.closed_message || "We're closed right now — back soon."
    };
  }
  const day = _pktDay();
  const cur = _pktMinutes();
  const today = storeStatus.hours.find(h => h.day_of_week === day);

  if (today && !today.is_closed){
    const [oh,om] = today.opens_at.split(":").map(Number);
    let   [ch,cm] = today.closes_at.split(":").map(Number);
    const open  = oh*60 + om;
    let   close = ch*60 + cm;
    if (close <= open) close += 24*60; // crosses midnight
    const curAdj = cur < open && close > 24*60 ? cur + 24*60 : cur;
    if (curAdj >= open && curAdj < close){
      return { open:true, today, opens_at: today.opens_at, closes_at: today.closes_at };
    }
  }

  // Find next opening
  const next = _findNextOpening();
  return { open:false, why:"hours", today, next };
}

function _findNextOpening(){
  if (!storeStatus.hours.length) return null;
  const day  = _pktDay();
  const cur  = _pktMinutes();
  for (let i = 0; i < 7; i++){
    const d = (day + i) % 7;
    const row = storeStatus.hours.find(h => h.day_of_week === d);
    if (!row || row.is_closed) continue;
    const [oh,om] = row.opens_at.split(":").map(Number);
    const openMin = oh*60 + om;
    if (i === 0 && cur < openMin){
      return { day: d, opens_at: row.opens_at, label: "today" };
    }
    if (i > 0){
      return {
        day: d,
        opens_at: row.opens_at,
        label: i === 1 ? "tomorrow" : _PKT_DAYS_LONG[d]
      };
    }
  }
  return null;
}

function applyStoreStatus(){
  const status = evaluateStoreStatus();
  const banner = document.getElementById("closedBanner");
  if (!banner) return;

  if (status.open){
    banner.hidden = true;
    document.body.classList.remove("is-store-closed");
    return;
  }

  // build message
  let head = "We're closed right now";
  let sub  = "";
  if (status.why === "force"){
    head = "We're taking a quick break";
    sub  = status.message || "Back shortly!";
  } else if (status.next){
    sub = `Opens ${status.next.label} at ${_fmt12(status.next.opens_at)}`;
  } else {
    sub = "Check back soon";
  }

  document.getElementById("cbHeadline").textContent = head;
  document.getElementById("cbSub").innerHTML        = sub;
  banner.hidden = false;
  document.body.classList.add("is-store-closed");
}

function startStoreStatusClock(){
  // re-evaluate every 30s so banner flips around opening / closing time
  setInterval(applyStoreStatus, 30000);

  // Realtime — admin edits propagate immediately
  if (!window.db) return;
  window.db
    .channel("hours-customer")
    .on("postgres_changes",
        { event:"*", schema:"public", table:"business_hours" },
        () => loadBusinessHours())
    .on("postgres_changes",
        { event:"*", schema:"public", table:"app_settings" },
        () => loadBusinessHours())
    .subscribe();
}


/* ==================================================================
   AUTO-APPLY PROMOTIONS  (no code needed; shown as crossed-out price)
=================================================================== */
const autoPromos = [];      // array of active is_auto_apply coupon rows

async function loadAutoPromos(){
  if (!window.db) return;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await window.db
      .from("coupons")
      .select("*")
      .eq("is_auto_apply", true)
      .eq("is_active", true);
    if (error) throw error;
    autoPromos.length = 0;
    (data || [])
      .filter(p =>
        (!p.valid_from  || p.valid_from  <= nowIso) &&
        (!p.valid_until || p.valid_until >= nowIso) &&
        (!p.usage_limit || p.used_count < p.usage_limit))
      .forEach(p => autoPromos.push(p));
    applyAutoPromosToMenu();
  } catch (e){
    console.warn("[wokin] auto-promos fetch failed:", e.message);
  }
}

function _bestPromoFor(dish, cat){
  // Find the best (largest discount) auto-promo that matches a given dish
  if (!autoPromos.length) return null;
  const slug = window.slugifyDish ? window.slugifyDish(dish.name) : "";
  const basePrice = dish._price != null ? dish._price : dish.price;

  let best = null;
  for (const p of autoPromos){
    let matches = false;
    if (p.scope === "order"){
      matches = true;
    } else if (p.scope === "category"){
      const cats = p.scope_categories?.length ? p.scope_categories
                 : (p.scope_category ? [p.scope_category] : []);
      matches = cats.includes(cat.id);
    } else if (p.scope === "dish_static"){
      if (dish._custom) { matches = false; }
      else {
        const slugs = p.scope_dish_slugs?.length ? p.scope_dish_slugs
                    : (p.scope_dish_slug ? [p.scope_dish_slug] : []);
        matches = slugs.includes(slug);
      }
    } else if (p.scope === "dish_custom"){
      const ids = p.scope_custom_dish_ids?.length ? p.scope_custom_dish_ids
                : (p.scope_custom_dish_id ? [p.scope_custom_dish_id] : []);
      matches = !!dish._customId && ids.includes(dish._customId);
    }

    if (!matches) continue;

    let amount = p.discount_type === "percent"
      ? basePrice * p.discount_value / 100
      : p.discount_value;
    if (p.max_discount != null) amount = Math.min(amount, p.max_discount);
    amount = Math.min(amount, basePrice);

    if (!best || amount > best.amount){
      best = { promo: p, amount, newPrice: Math.max(0, Math.round(basePrice - amount)) };
    }
  }
  return best;
}

function applyAutoPromosToMenu(){
  if (typeof MENU_DATA === "undefined") return;
  MENU_DATA.forEach(cat => {
    cat.items.forEach(d => {
      const hit = _bestPromoFor(d, cat);
      if (hit){
        d._originalPrice = d._price != null ? d._price : d.price;
        d._price         = hit.newPrice;
        d._promoLabel    = hit.promo.label;
      } else {
        // restore baseline if previously had promo
        if (d._originalPrice != null){
          d._price = d._originalPrice;
          d._originalPrice = undefined;
          d._promoLabel = undefined;
        }
      }
    });
  });
}

async function loadCustomDishes(){
  if (!window.db || typeof MENU_DATA === "undefined") return;
  try {
    const { data, error } = await window.db
      .from("custom_dishes")
      .select("*")
      .eq("is_available", true)
      .order("position", { ascending: true });
    if (error) throw error;

    // Strip out any previously-merged custom dishes before re-adding
    MENU_DATA.forEach(cat => { cat.items = cat.items.filter(d => !d._custom); });

    (data || []).forEach(d => {
      const cat = MENU_DATA.find(c => c.id === d.category_id);
      if (!cat) return;
      cat.items.push({
        name: d.name,
        desc: d.description || "",
        pcs: d.pcs || undefined,
        price: Number(d.price),
        priceFull: d.price_full != null ? Number(d.price_full) : undefined,
        smallLabel: d.small_label || undefined,
        tags: d.tags || [],
        _custom: true,            // marker so we can re-merge cleanly
        _customId: d.id,          // for matching dish_custom scope
        _available: true,         // already filtered server-side
        _imageUrl: d.image_path
          ? `${window.SUPABASE_URL || ""}/storage/v1/object/public/dish-images/${d.image_path}`
          : null,
      });
    });
  } catch (e){
    console.warn("[wokin] custom_dishes fetch failed:", e.message);
  }
}

function subscribeMenuOverrides(){
  if (!window.db) return;
  const rerender = () => {
    const root = document.getElementById("menuRoot");
    const nav  = document.getElementById("catNavInner");
    if (root) root.innerHTML = "";
    if (nav)  nav.innerHTML  = "";
    renderMenu();
  };
  window.db
    .channel("menu-overrides-customer")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "menu_overrides" },
        () => loadMenuOverrides().then(rerender))
    .on("postgres_changes",
        { event: "*", schema: "public", table: "custom_dishes" },
        () => loadCustomDishes().then(rerender))
    .on("postgres_changes",
        { event: "*", schema: "public", table: "coupons" },
        () => loadAutoPromos().then(rerender))
    .subscribe();
}


/* ==================================================================
   LOCATION MODAL  (single screen, no GPS)
=================================================================== */
let _locDraft = { type: null, area: null };

function openLocModal(){
  _locDraft = { type: state.type || "delivery", area: state.area || null };

  document.getElementById("locModal").classList.remove("is-hidden");
  document.body.classList.add("state-locked");

  // reflect selection in pill toggle
  document.querySelectorAll(".loc-pill").forEach(p => {
    p.classList.toggle("is-on", p.dataset.type === _locDraft.type);
  });
  updateLocAreaLabel();

  // render area list with active selection
  renderAreaList(document.getElementById("areaSearch").value || "");
  updateLocGoState();
  recalcCart();
}

function closeLocModal(){
  document.getElementById("locModal").classList.add("is-hidden");
  document.body.classList.remove("state-locked");
  recalcCart();
}

function updateLocAreaLabel(){
  const isPickup = _locDraft.type === "pickup";
  const lbl = document.getElementById("locAreaLabel");
  if (lbl) lbl.textContent = isPickup ? "WHERE TO FIND US" : "WHICH AREA?";

  // Pick-up has a single branch — swap the area picker for the branch card
  const deliv = document.getElementById("locDeliveryArea");
  const pick  = document.getElementById("locPickupInfo");
  if (deliv) deliv.hidden = isPickup;
  if (pick)  pick.hidden  = !isPickup;

  // Pick-up needs no area selection — pin the branch so the CTA can proceed
  if (isPickup){
    _locDraft.area = PICKUP_BRANCH_LABEL;
  } else if (_locDraft.area === PICKUP_BRANCH_LABEL){
    _locDraft.area = state.type === "pickup" ? null : (state.area || null);
  }
}

function updateLocGoState(){
  const btn = document.getElementById("locGo");
  if (!btn) return;
  // Pick-up only needs the type chosen; delivery also needs an area
  btn.disabled = _locDraft.type === "pickup"
    ? false
    : !(_locDraft.type && _locDraft.area);
}

function bindLocationModal(){
  document.querySelectorAll(".loc-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      _locDraft.type = pill.dataset.type;
      document.querySelectorAll(".loc-pill").forEach(p =>
        p.classList.toggle("is-on", p === pill));
      updateLocAreaLabel();
      updateLocGoState();
    });
  });

  document.getElementById("locDismiss").addEventListener("click", closeLocModal);

  document.getElementById("areaSearch").addEventListener("input", e => {
    renderAreaList(e.target.value);
  });

  document.getElementById("locGo").addEventListener("click", () => {
    const isPickup = _locDraft.type === "pickup";
    if (!_locDraft.type || (!isPickup && !_locDraft.area)) return;
    state.type = _locDraft.type;
    state.area = isPickup ? null : _locDraft.area;  // pick-up = single branch, no area
    saveState();
    syncBarLocation();
    const sel = document.getElementById("coArea");
    if (sel) sel.value = state.area;
    recalcCart();
    closeLocModal();
  });

  renderAreaList("");
}

function renderAreaList(filter){
  const ul = document.getElementById("areaList");
  const term = filter.trim().toLowerCase();
  const matches = DELIVERY_AREAS.filter(a => a.toLowerCase().includes(term));
  ul.innerHTML = "";
  if (!matches.length){
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `No match for "${filter}" — try a nearby area, or call us.`;
    ul.appendChild(li);
    return;
  }
  matches.forEach(area => {
    const li = document.createElement("li");
    li.dataset.area = area;
    li.innerHTML = `<span>${area}</span><small>Tap to select</small>`;
    if (_locDraft.area === area) li.classList.add("is-active");
    li.addEventListener("click", () => {
      _locDraft.area = area;
      document.querySelectorAll("#areaList li").forEach(x =>
        x.classList.toggle("is-active", x.dataset.area === area));
      updateLocGoState();
    });
    ul.appendChild(li);
  });
}

function syncBarLocation(){
  document.getElementById("barTypeLabel").textContent =
    state.type === "pickup" ? "PICK-UP FROM" : (state.type ? "DELIVERY TO" : "CHOOSE");
  const areaLabel = state.type === "pickup" ? "Gulberg Greens" : (state.area || "— pick an area —");
  document.getElementById("barAreaLabel").textContent = areaLabel;
  const hamArea = document.getElementById("hamAreaDisplay");
  if (hamArea) hamArea.textContent = state.type
    ? `${state.type === "pickup" ? "Pick-up" : "Delivery"}: ${areaLabel}`
    : "— pick an area —";
}

function populateAreaSelect(){
  const sel = document.getElementById("coArea");
  if (!sel) return;
  sel.innerHTML = DELIVERY_AREAS.map(a =>
    `<option value="${a}" ${state.area===a?"selected":""}>${a}</option>`
  ).join("");
}


/* ==================================================================
   TOP BAR
=================================================================== */
function bindTopBar(){
  document.getElementById("barLocBtn").addEventListener("click", openLocModal);
  document.getElementById("cartBtn").addEventListener("click", openCart);
  document.getElementById("searchBtn").addEventListener("click", openSearch);
  document.getElementById("ctaOrder").addEventListener("click", () => {
    document.querySelector(".popular")?.scrollIntoView({ behavior:"smooth" });
  });
  document.getElementById("footerCart").addEventListener("click", openCart);
  document.getElementById("fabCart").addEventListener("click", openCart);

  // hamburger
  const hamBtn   = document.getElementById("hamburgerBtn");
  const hamDrawer = document.getElementById("hamDrawer");
  const hamClose  = document.getElementById("hamClose");
  const hamOverlay = document.getElementById("hamOverlay");
  const openHam = () => { hamDrawer.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden"; };
  const closeHam = () => { hamDrawer.setAttribute("aria-hidden","true"); document.body.style.overflow=""; };
  hamBtn?.addEventListener("click", openHam);
  hamClose?.addEventListener("click", closeHam);
  hamOverlay?.addEventListener("click", closeHam);
  document.getElementById("hamSearchLink")?.addEventListener("click", () => { closeHam(); openSearch(); });
  document.getElementById("hamLocLink")?.addEventListener("click", () => { closeHam(); openLocModal(); });
}


/* ==================================================================
   MENU RENDER
=================================================================== */
function renderMenu(){
  const root = document.getElementById("menuRoot");
  const nav  = document.getElementById("catNavInner");

  // skip beverages if you want? we'll keep them; they have their own section
  MENU_DATA.forEach(cat => {
    const visible = cat.items.filter(d => !d._hidden);
    if (!visible.length) return;   // whole category hidden → skip nav + section

    // nav chip
    const chip = document.createElement("button");
    chip.className = "cat-chip";
    chip.dataset.cat = cat.id;
    chip.innerHTML = `<span class="em">${cat.emoji||""}</span> ${cat.name}`;
    chip.addEventListener("click", () => {
      document.getElementById("cat-" + cat.id)?.scrollIntoView({ behavior:"smooth" });
    });
    nav.appendChild(chip);

    // section
    const sec = document.createElement("section");
    sec.className = "cat-section";
    sec.id = "cat-" + cat.id;

    const head = document.createElement("div");
    head.className = "cat-head";
    head.innerHTML = `
      <span class="em">${cat.emoji||""}</span>
      <h2>${cat.name}</h2>
      ${cat.tagline ? `<span class="tag">"${cat.tagline}"</span>`:""}
    `;
    sec.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "dish-grid";
    visible.forEach((dish, idx) => {
      grid.appendChild(dishCard(dish, cat, idx));
    });
    sec.appendChild(grid);
    root.appendChild(sec);
  });

  // sticky chip active state on scroll
  observeCatNav();
}

function dishCard(dish, cat, idx){
  const id = makeDishId(dish, cat);
  const img = dish._imageUrl || getDishImage(dish.name, cat.id);
  const initial = dish.name.charAt(0);

  // resolve effective values from live overrides (falls back to static)
  const available = dish._available !== false;
  const price     = dish._price     != null ? dish._price     : dish.price;
  const priceFull = dish._priceFull != null ? dish._priceFull : dish.priceFull;
  const desc      = dish._desc      != null ? dish._desc      : (dish.desc || "");
  const pcs       = dish._pcs       != null ? dish._pcs       : dish.pcs;

  const hasPromo  = dish._originalPrice != null && dish._originalPrice !== price;
  const promoLbl  = dish._promoLabel || "";

  const tagsHtml = (dish.tags||[]).map(t => `<span class="dish-tag ${t}">${tagLabel(t)}</span>`).join("");
  const soldOutChip = available ? "" : `<span class="dish-tag sold-out">SOLD OUT</span>`;
  const promoChip   = hasPromo  ? `<span class="dish-tag promo">${promoLbl}</span>` : "";

  const card = document.createElement("article");
  card.className = "dish-card" + (available ? "" : " is-sold-out") + (hasPromo ? " has-promo" : "");
  card.dataset.id = id;

  const hasFull = priceFull && priceFull !== price;

  card.innerHTML = `
    <div class="img" data-initial="${initial}">
      <div class="img-tags">${promoChip}${soldOutChip}${tagsHtml}</div>
    </div>
    <div class="pad">
      <h3>${dish.name}</h3>
      ${pcs ? `<span class="pcs">${pcs}</span>`:""}
      <p>${desc}</p>
      ${hasFull ? `
      <div class="foot foot-full">
        <div class="size-rows"></div>
      </div>` : `
      <div class="foot">
        <div class="prices">
          ${hasPromo
            ? `<span class="price-half"><s class="price-was">${fmtPKR(dish._originalPrice)}</s> <b>${fmtPKR(price)}</b>${dish.smallLabel?` <em>· ${dish.smallLabel}</em>`:""}</span>`
            : `<span class="price-half">${fmtPKR(price)}${dish.smallLabel?` <em>· ${dish.smallLabel}</em>`:""}</span>`}
        </div>
        <div class="action"></div>
      </div>`}
    </div>
  `;
  applyDishBg(card.querySelector(".img"), img, dish._imageAlt);

  // wire add button (or sold-out badge instead)
  refreshDishAction(card, dish, cat);
  return card;
}

function flashCard(card){
  bumpCartIcon();
  card.classList.add("is-flash");
  setTimeout(() => card.classList.remove("is-flash"), 600);
}

// Build a − qty + stepper for a given cart id.
function buildStepper(id, qty, onChange){
  const st = document.createElement("div");
  st.className = "stepper stepper-sm";
  st.innerHTML = `<button aria-label="Decrease">−</button><b>${qty}</b><button aria-label="Increase">+</button>`;
  st.querySelectorAll("button")[0].addEventListener("click", e => { e.stopPropagation(); changeQty(id, -1); onChange && onChange(); });
  st.querySelectorAll("button")[1].addEventListener("click", e => { e.stopPropagation(); changeQty(id, +1); onChange && onChange(); });
  return st;
}

// Half / Full dishes: a clean row per size (label · pcs · price · add/qty)
function renderSizeRows(host, card, dish, cat, variants){
  host.innerHTML = "";
  if (dish._available === false){
    host.innerHTML = `<span class="sold-out-pill">SOLD OUT</span>`;
    return;
  }
  variants.forEach(v => {
    const vid = makeDishId(dish, cat, v.key);
    const vit = state.cart.find(c => c.id === vid);
    const row = document.createElement("div");
    row.className = "size-row" + (vit ? " in-cart" : "");
    row.innerHTML = `
      <div class="sr-meta"><b>${v.label}</b>${v.pcs ? `<small>${v.pcs}</small>` : ""}</div>
      <span class="sr-price">${fmtPKR(v.price)}</span>
      <div class="sr-act"></div>
    `;
    const act = row.querySelector(".sr-act");
    if (vit){
      act.appendChild(buildStepper(vid, vit.qty, () => refreshDishAction(card, dish, cat)));
    } else {
      const b = document.createElement("button");
      b.className = "add-btn add-sm";
      b.textContent = "ADD";
      b.addEventListener("click", e => {
        e.stopPropagation();
        addToCart(dish, cat, v.key);
        refreshDishAction(card, dish, cat);
        flashCard(card);
      });
      act.appendChild(b);
    }
    host.appendChild(row);
  });
}

function refreshDishAction(card, dish, cat){
  // Half / Full dishes render into their own size-rows block
  const sizeHost = card.querySelector(".size-rows");
  if (sizeHost){
    renderSizeRows(sizeHost, card, dish, cat, dishVariants(dish));
    return;
  }

  const id     = makeDishId(dish, cat);
  const item   = state.cart.find(c => c.id === id);
  const action = card.querySelector(".action");
  action.innerHTML = "";

  // sold-out wins over everything else
  if (dish._available === false){
    const tag = document.createElement("span");
    tag.className = "sold-out-pill";
    tag.textContent = "SOLD OUT";
    action.appendChild(tag);
    return;
  }

  if (item){
    const stepper = document.createElement("div");
    stepper.className = "stepper";
    stepper.innerHTML = `
      <button aria-label="Decrease">−</button>
      <b>${item.qty}</b>
      <span class="step-lbl">added ✓</span>
      <button aria-label="Increase">+</button>
    `;
    stepper.querySelectorAll("button")[0].addEventListener("click", e => {
      e.stopPropagation();
      changeQty(id, -1);
      refreshDishAction(card, dish, cat);
    });
    stepper.querySelectorAll("button")[1].addEventListener("click", e => {
      e.stopPropagation();
      changeQty(id, +1);
      refreshDishAction(card, dish, cat);
    });
    action.appendChild(stepper);
  } else {
    const btn = document.createElement("button");
    btn.className = "add-btn";
    btn.textContent = "ADD +";
    btn.addEventListener("click", () => {
      addToCart(dish, cat);
      refreshDishAction(card, dish, cat);
      bumpCartIcon();
      // brief flash on the card so user sees the add
      card.classList.add("is-flash");
      setTimeout(() => card.classList.remove("is-flash"), 600);
    });
    action.appendChild(btn);
  }
}

function tagLabel(t){
  return ({ chef:"CHEF'S", veg:"VEG", spicy:"SPICY", mild:"MILD" })[t] || t.toUpperCase();
}

function makeDishId(dish, cat, variant){
  return cat.id + "::" + dish.name.replace(/\s+/g,"_") + (variant ? "::" + variant : "");
}

// Half / Full sizes for a dish. Returns a single (size-less) entry for
// dishes that only have one price.
function dishVariants(dish){
  const price     = dish._price     != null ? dish._price     : dish.price;
  const priceHalf = dish._priceHalf != null ? dish._priceHalf : dish.priceHalf;
  const priceFull = dish._priceFull != null ? dish._priceFull : dish.priceFull;
  const pcs       = (dish._pcs != null ? dish._pcs : dish.pcs) || "";
  // Three sizes (soups): Single / Half / Full
  if (priceHalf != null && priceFull != null){
    return [
      { key: "single", label: "Single", price,            pcs: "" },
      { key: "half",   label: "Half",   price: priceHalf, pcs: "" },
      { key: "full",   label: "Full",   price: priceFull, pcs: "" },
    ];
  }
  // Two sizes: Half / Full
  if (priceFull && priceFull !== price){
    const parts = pcs.split("/").map(s => s.trim());
    return [
      { key: "half", label: "Half", price,           pcs: parts[0] || "" },
      { key: "full", label: "Full", price: priceFull, pcs: parts[1] || "" },
    ];
  }
  return [ { key: null, label: "", price, pcs } ];
}

function observeCatNav(){
  const sections = MENU_DATA.map(c => document.getElementById("cat-" + c.id));
  const chips    = Array.from(document.querySelectorAll(".cat-chip"));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){
        const id = e.target.id.replace("cat-","");
        chips.forEach(c => c.classList.toggle("is-active", c.dataset.cat === id));
        const active = chips.find(c => c.dataset.cat === id);
        if (active) active.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" });
      }
    });
  }, { rootMargin:"-200px 0px -60% 0px", threshold:0 });
  sections.forEach(s => s && obs.observe(s));
}


/* ==================================================================
   POPULAR ROW + UPSELL
=================================================================== */
function findDishByName(name){
  for (const cat of MENU_DATA){
    const d = cat.items.find(i => i.name === name);
    if (d) return { dish:d, cat };
  }
  return null;
}

// The "Crowd Favourites" list: dishes the admin flagged as popular; if the
// admin hasn't flagged any, fall back to the built-in curated list.
function getPopularPicks(){
  const flagged = [];
  MENU_DATA.forEach(cat => cat.items.forEach(d => {
    if (d._popular && !d._hidden) flagged.push({ dish: d, cat });
  }));
  if (flagged.length) return flagged;
  return POPULAR_DISH_NAMES
    .map(n => findDishByName(n))
    .filter(Boolean)
    .filter(({ dish }) => !dish._hidden);
}

function renderPopular(){
  const scroll = document.getElementById("popularScroll");
  scroll.innerHTML = "";
  getPopularPicks().forEach(({ dish, cat }) => {
    const img = dish._imageUrl || getDishImage(dish.name, cat.id);
    const card = document.createElement("div");
    card.className = "pop-card";
    card.innerHTML = `
      <div class="img"></div>
      <div class="pad">
        <h4>${dish.name}</h4>
        <p style="font-size:11px; color:var(--mute); margin:2px 0 0;">${(dish.desc||"").slice(0,68)}…</p>
        <div class="price">
          <b>${fmtPKR(dish.price)}</b>
          <button class="add" aria-label="Add to cart">+</button>
        </div>
      </div>
    `;
    applyDishBg(card.querySelector(".img"), img, dish._imageAlt);
    card.querySelector(".add").addEventListener("click", () => {
      addToCart(dish, cat);
      bumpCartIcon();
    });
    scroll.appendChild(card);
  });
}


/* ==================================================================
   CART
=================================================================== */
function addToCart(dish, cat, variantKey){
  if (dish._available === false){
    return; // shouldn't be reachable, but guard anyway
  }
  const variants = dishVariants(dish);
  const v = (variantKey ? variants.find(x => x.key === variantKey) : null) || variants[0];
  const id = makeDishId(dish, cat, v.key);
  const existing = state.cart.find(c => c.id === id);
  if (existing){ existing.qty += 1; }
  else {
    state.cart.push({
      id,
      name: dish.name,
      desc: v.pcs,
      variant: v.label || null,           // "Half" / "Full" (null when single-size)
      image: dish._imageUrl || getDishImage(dish.name, cat.id),
      price: v.price,
      qty: 1,
      customId: dish._customId || null,   // for scoped coupons
    });
  }
  // cart changed → invalidate any applied coupon discount until re-validated
  if (state.coupon){ state.couponDiscount = 0; state.coupon = null; state.couponLabel = ""; }
  saveState();
  recalcCart();

  // Meta Pixel — AddToCart signal for ad optimisation
  if (typeof fbq === "function") {
    fbq("track", "AddToCart", {
      value:     Math.round(v.price),
      currency:  "PKR",
      contents:  [{ id: dish.name + (v.label ? " ("+v.label+")" : ""), quantity: 1 }],
      num_items: 1,
    });
  }
}

function changeQty(id, delta){
  const item = state.cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(c => c.id !== id);
  // cart changed → invalidate coupon
  if (state.coupon){ state.couponDiscount = 0; state.coupon = null; state.couponLabel = ""; }
  saveState();
  recalcCart();
  refreshCardForId(id);
}

function removeItem(id){
  state.cart = state.cart.filter(c => c.id !== id);
  saveState();
  recalcCart();
  refreshCardForId(id);
}

// Build the size switcher for a cart line, listing all of the dish's sizes.
function cartSizeToggle(item){
  const [catId] = item.id.split("::");
  const baseId  = item.id.split("::").slice(0, 2).join("::");
  const cat  = MENU_DATA.find(c => c.id === catId);
  const dish = cat && cat.items.find(d => makeDishId(d, cat) === baseId);
  if (!dish) return "";
  const variants = dishVariants(dish);
  if (variants.length < 2) return "";
  const curKey = variants.find(v => v.label === item.variant)?.key;
  return `<div class="cart-size" data-id="${item.id}">` +
    variants.map(v => `<button type="button" data-v="${v.key}" class="${v.key === curKey ? "is-on" : ""}">${v.label}</button>`).join("") +
    `</div>`;
}

// Switch a cart line to another size (merges if the target already exists).
function switchCartVariant(id, targetKey){
  const item = state.cart.find(c => c.id === id);
  if (!item) return;
  const [catId] = id.split("::");
  const baseId  = id.split("::").slice(0, 2).join("::");
  const cat  = MENU_DATA.find(c => c.id === catId);
  const dish = cat && cat.items.find(d => makeDishId(d, cat) === baseId);
  if (!dish) return;
  const v = dishVariants(dish).find(x => x.key === targetKey);
  if (!v) return;
  const newId = makeDishId(dish, cat, v.key);
  if (newId === id) return;                       // already that size

  const existing = state.cart.find(c => c.id === newId);
  if (existing){
    existing.qty += item.qty;                     // merge into the existing size
    state.cart = state.cart.filter(c => c.id !== id);
  } else {
    item.id = newId; item.variant = v.label; item.price = v.price; item.desc = v.pcs;
  }
  if (state.coupon){ state.couponDiscount = 0; state.coupon = null; state.couponLabel = ""; }
  saveState();
  recalcCart();
  refreshCardForId(newId);
}

// Re-render the dish card matching a (possibly variant-suffixed) cart id.
function refreshCardForId(id){
  const [catId, , variant] = id.split("::");
  const baseId = id.split("::").slice(0, 2).join("::");
  document.querySelectorAll(`.dish-card[data-id="${CSS.escape(baseId)}"]`).forEach(card => {
    const cat = MENU_DATA.find(c => c.id === catId);
    if (!cat) return;
    const dish = cat.items.find(d => makeDishId(d, cat) === baseId);
    if (dish) refreshDishAction(card, dish, cat);
  });
}

function cartTotals(){
  const sub = state.cart.reduce((s,i) => s + i.price * i.qty, 0);
  // Pick-up paid by card is taxed at the reduced rate
  const taxRate = (state.type === "pickup" && state.payment === "card")
    ? TAX_RATE_PICKUP_CARD : TAX_RATE;
  const tax = sub * taxRate;
  const isFreeDel = sub >= FREE_THRESHOLD || state.type === "pickup";
  const del = (state.type === "pickup") ? 0 : (isFreeDel ? 0 : DELIVERY_FEE);
  // discount validated server-side via validate_coupon RPC
  const discount = Math.min(state.couponDiscount || 0, sub);
  const grand = Math.max(0, sub - discount) + tax + del;
  return { sub, tax, del, discount, grand, isFreeDel, taxRate };
}

function recalcCart(){
  const t = cartTotals();
  const qty = state.cart.reduce((s,i)=>s+i.qty,0);

  // bar badge
  const badge = document.getElementById("cartBadge");
  badge.textContent = qty;
  badge.classList.toggle("is-empty", qty === 0);

  // floating view-cart pill
  const fab = document.getElementById("fabCart");
  if (fab){
    const drawerOpen = document.getElementById("cartDrawer")?.classList.contains("is-on");
    const coOpen     = !document.getElementById("checkout")?.hidden;
    const blocked    = drawerOpen || coOpen || document.body.classList.contains("state-locked");
    fab.hidden = qty === 0 || blocked;
    document.getElementById("fabCount").textContent = qty;
    document.getElementById("fabTotal").textContent = fmtPKR(t.grand);
  }

  // drawer
  const empty = document.getElementById("cartEmpty");
  const list  = document.getElementById("cartList");
  const tots  = document.getElementById("cartTotals");
  const upsell= document.getElementById("cartUpsell");
  const freeb = document.getElementById("cartFreebar");
  const foot  = document.getElementById("cartFoot");

  if (qty === 0){
    empty.style.display = "block";
    list.style.display  = "none";
    tots.hidden = true; upsell.hidden = true; freeb.hidden = true; foot.hidden = true;
    { const cp = document.getElementById("cartPay"); if (cp) cp.hidden = true; }
    document.getElementById("cartSub").textContent = "0 items · pick something delicious";
    return;
  }
  empty.style.display = "none";
  list.style.display  = "flex";
  tots.hidden = false; upsell.hidden = false; freeb.hidden = false; foot.hidden = false;

  document.getElementById("cartSub").textContent =
    `${qty} item${qty>1?"s":""} · ${state.type === "pickup" ? "ready in ~20 min" : "delivery to " + (state.area || "—")}`;

  list.innerHTML = "";
  state.cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="img"></div>
      <div class="info">
        <b>${item.name}</b>
        ${item.desc?`<small>${item.desc}</small>`:""}
        ${item.variant ? cartSizeToggle(item) : ""}
        <div class="row">
          <span class="price">${fmtPKR(item.price)}</span>
          <a class="remove" href="#" data-id="${item.id}">Remove</a>
        </div>
      </div>
      <div class="stepper">
        <button data-id="${item.id}" data-d="-1">−</button>
        <b>${item.qty}</b>
        <button data-id="${item.id}" data-d="1">+</button>
      </div>
    `;
    applyDishBg(row.querySelector(".img"), item.image);
    list.appendChild(row);
  });
  list.querySelectorAll(".stepper button").forEach(b => {
    b.addEventListener("click", () => changeQty(b.dataset.id, Number(b.dataset.d)));
  });
  list.querySelectorAll(".remove").forEach(a => {
    a.addEventListener("click", e => { e.preventDefault(); removeItem(a.dataset.id); });
  });
  list.querySelectorAll(".cart-size button").forEach(b => {
    b.addEventListener("click", () => {
      switchCartVariant(b.closest(".cart-size").dataset.id, b.dataset.v);
    });
  });

  // upsell
  renderUpsell();

  // pick-up pay-by toggle (Card → 5% tax). Only relevant for pick-up.
  const cartPay = document.getElementById("cartPay");
  if (cartPay){
    cartPay.hidden = state.type !== "pickup";
    document.querySelectorAll("#cartPayOpts button").forEach(b =>
      b.classList.toggle("is-on", b.dataset.pay === state.payment));
  }

  // free delivery bar
  if (state.type === "pickup"){
    freeb.hidden = true;
  } else {
    freeb.hidden = false;
    const fill = document.getElementById("freebarFill");
    const lbl  = document.getElementById("freebarLbl");
    const pct  = Math.min(100, (t.sub / FREE_THRESHOLD) * 100);
    fill.style.width = pct + "%";
    if (t.isFreeDel){
      freeb.classList.add("is-free");
      lbl.textContent = "🎉 FREE DELIVERY UNLOCKED!";
    } else {
      freeb.classList.remove("is-free");
      lbl.textContent = `Add ${fmtPKR(FREE_THRESHOLD - t.sub)} to unlock FREE delivery`;
    }
  }

  document.getElementById("totSub").textContent = fmtPKR(t.sub);
  document.getElementById("totTax").textContent = fmtPKR(t.tax);
  { const el = document.getElementById("taxPctCart"); if (el) el.textContent = Math.round(t.taxRate * 100); }
  document.getElementById("totDel").textContent = t.del === 0 ? "FREE" : fmtPKR(t.del);
  document.getElementById("totGrand").textContent = fmtPKR(t.grand);
  document.getElementById("totDelEta").textContent =
    state.type === "pickup" ? "· ready ~20 min" : "· arrives ~45 min";

  // also keep checkout summary in sync if open
  if (document.getElementById("checkout") && !document.getElementById("checkout").hidden){
    renderCheckoutSummary();
  }
}

function renderUpsell(){
  const scroll = document.getElementById("upsellScroll");
  scroll.innerHTML = "";
  const inCart = new Set(state.cart.map(c => c.id));
  const picks = getPopularPicks()
    .filter(({ dish, cat }) => !inCart.has(makeDishId(dish, cat)))
    .slice(0, 6);

  picks.forEach(({ dish, cat }) => {
    const card = document.createElement("div");
    card.className = "up-card";
    card.innerHTML = `
      <div class="img"></div>
      <div class="pad">
        <b>${dish.name}</b>
        <div class="row">
          <span>${fmtPKR(dish.price)}</span>
          <button class="add" aria-label="Add">+</button>
        </div>
      </div>
    `;
    applyDishBg(card.querySelector(".img"), dish._imageUrl || getDishImage(dish.name, cat.id), dish._imageAlt);
    card.querySelector(".add").addEventListener("click", () => addToCart(dish, cat));
    scroll.appendChild(card);
  });
}

function openCart(){
  document.getElementById("cartDrawer").classList.add("is-on");
  document.getElementById("scrim").hidden = false;
  setTimeout(() => document.getElementById("scrim").classList.add("is-on"), 10);
  document.body.classList.add("state-locked");
  recalcCart();
}
function closeCart(){
  document.getElementById("cartDrawer").classList.remove("is-on");
  document.getElementById("scrim").classList.remove("is-on");
  setTimeout(() => { document.getElementById("scrim").hidden = true; }, 280);
  document.body.classList.remove("state-locked");
  recalcCart();
}
function bindCart(){
  document.getElementById("cartClose").addEventListener("click", closeCart);
  document.getElementById("scrim").addEventListener("click", closeCart);
  document.getElementById("emptyBrowseBtn").addEventListener("click", () => {
    closeCart();
    document.querySelector(".cat-nav")?.scrollIntoView({ behavior:"smooth" });
  });
  document.getElementById("checkoutBtn").addEventListener("click", openCheckout);
  // pick-up pay-by toggle (Cash / Card → 5% tax)
  document.querySelectorAll("#cartPayOpts button").forEach(b => {
    b.addEventListener("click", () => {
      state.payment = b.dataset.pay;
      saveState();
      recalcCart();
    });
  });
}

function bumpCartIcon(){
  const btn = document.getElementById("cartBtn");
  btn.animate(
    [{ transform:"scale(1)" }, { transform:"scale(1.15)" }, { transform:"scale(1)" }],
    { duration:300, easing:"ease-out" }
  );
}


/* ==================================================================
   SEARCH
=================================================================== */
function openSearch(){
  const ov = document.getElementById("searchOverlay");
  ov.hidden = false;
  document.body.classList.add("state-locked");
  document.getElementById("searchInput").focus();
  doSearch("");
}
function closeSearch(){
  document.getElementById("searchOverlay").hidden = true;
  document.body.classList.remove("state-locked");
}
function bindSearch(){
  document.getElementById("searchClose").addEventListener("click", closeSearch);
  document.getElementById("searchInput").addEventListener("input", e => doSearch(e.target.value));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSearch();
  });
}
function doSearch(q){
  const term = q.trim().toLowerCase();
  const results = document.getElementById("searchResults");
  results.innerHTML = "";
  if (!term){
    results.innerHTML = `<p class="search-no">Type to search — try "prawn", "manchurian", "rice"…</p>`;
    return;
  }
  const hits = [];
  MENU_DATA.forEach(cat => {
    cat.items.forEach(dish => {
      if (dish._hidden) return;   // hidden from customers
      if ((dish.name + " " + (dish.desc||"")).toLowerCase().includes(term)){
        hits.push({ dish, cat });
      }
    });
  });
  if (!hits.length){
    results.innerHTML = `<p class="search-no">No dishes match "${q}". Try another word.</p>`;
    return;
  }
  hits.slice(0, 30).forEach(({ dish, cat }) => {
    const price    = dish._price != null ? dish._price : dish.price;
    const desc     = dish._desc  != null ? dish._desc  : (dish.desc || "");
    const soldOut  = dish._available === false;
    const hasFull  = dishVariants(dish).length > 1;

    const card = document.createElement("div");
    card.className = "search-card" + (soldOut ? " is-sold-out" : "");
    card.innerHTML = `
      <div class="sc-img"></div>
      <div class="sc-body">
        <h4>${dish.name}</h4>
        <p>${desc.slice(0,80)}${desc.length>80?"…":""}</p>
        <div class="sc-foot">
          <b>${hasFull ? "From " : ""}${fmtPKR(price)}</b>
          <div class="sc-act"></div>
        </div>
      </div>
    `;
    applyDishBg(card.querySelector(".sc-img"), dish._imageUrl || getDishImage(dish.name, cat.id), dish._imageAlt);
    const act = card.querySelector(".sc-act");
    if (soldOut){
      act.innerHTML = `<span class="sc-soldout">SOLD OUT</span>`;
    } else {
      const btn = document.createElement("button");
      btn.className = "sc-add";
      btn.textContent = "ADD +";
      btn.addEventListener("click", () => {
        addToCart(dish, cat);          // default size; switchable in the cart
        btn.textContent = "ADDED ✓"; btn.classList.add("is-added"); bumpCartIcon();
        setTimeout(() => { btn.textContent = "ADD +"; btn.classList.remove("is-added"); }, 1100);
      });
      act.appendChild(btn);
    }
    results.appendChild(card);
  });
}


/* ==================================================================
   CHECKOUT
=================================================================== */
function openCheckout(){
  if (!state.cart.length){
    showDialog({ icon:"🛒", title:"CART IS EMPTY", body:"Add something delicious first!" });
    return;
  }
  // Block checkout when closed (kill-switch OR outside hours)
  const status = evaluateStoreStatus();
  if (!status.open){
    let when = "shortly";
    if (status.next) when = `${status.next.label} at ${_fmt12(status.next.opens_at)}`;
    showDialog({
      icon: "🕐",
      title: "WE'RE CLOSED",
      body: `We're not taking orders right now.\n\nYou can place your order ${when}.\n\nYour cart is saved — we'll be here soon! 🙏`,
      ok: "GOT IT"
    });
    return;
  }
  if (!state.area && state.type !== "pickup"){
    openLocModal();
    return;
  }
  closeCart();

  // Swap the address fieldset for the pick-up branch card
  const isPickup = state.type === "pickup";
  document.getElementById("coDeliveryFs").hidden = isPickup;
  document.getElementById("coPickupFs").hidden   = !isPickup;
  // Hidden required fields block native form submit — toggle them off for pick-up
  document.getElementById("coArea").required    = !isPickup;
  document.getElementById("coAddress").required = !isPickup;

  populateAreaSelect();
  document.getElementById("coArea").value =
    (state.area && DELIVERY_AREAS.includes(state.area)) ? state.area : DELIVERY_AREAS[0];
  reflectPaymentMethod();
  document.getElementById("checkout").hidden = false;
  document.body.classList.add("state-locked");
  document.getElementById("checkout").scrollTo(0,0);
  renderCheckoutSummary();
  if (!isPickup) mountMap();
  recalcCart();

  // Meta Pixel — InitiateCheckout signal for ad optimisation
  if (typeof fbq === "function") {
    const t = cartTotals();
    fbq("track", "InitiateCheckout", {
      value:     Math.round(t.grand),
      currency:  "PKR",
      contents:  state.cart.map(c => ({ id: c.name, quantity: c.qty })),
      num_items: state.cart.reduce((n, c) => n + c.qty, 0),
    });
  }
}
function closeCheckout(){
  document.getElementById("checkout").hidden = true;
  document.body.classList.remove("state-locked");
  recalcCart();
}

// Show/hide the Card option (pick-up only) and reflect the chosen method.
function reflectPaymentMethod(){
  const isPickup = state.type === "pickup";
  const cardOpt = document.getElementById("payCardOpt");
  const cashSub = document.getElementById("payCashSub");
  if (cardOpt) cardOpt.hidden = !isPickup;
  if (!isPickup && state.payment === "card"){ state.payment = "cash"; saveState(); }
  if (cashSub) cashSub.textContent = isPickup ? "Pay cash at the counter" : "Pay the rider on delivery";
  document.querySelectorAll("#payMethods .pay-opt").forEach(o =>
    o.classList.toggle("is-on", o.dataset.pay === state.payment));
  const changeField = document.getElementById("changeField");
  if (changeField) changeField.hidden = state.payment !== "cash";
}

function bindCheckout(){
  document.getElementById("coBack").addEventListener("click", () => { closeCheckout(); openCart(); });

  // mobile auto-format 03XX-XXXXXXX
  ["coPhone","coPhoneAlt"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      let v = el.value.replace(/\D/g,"").slice(0,11);
      if (v.length > 4) v = v.slice(0,4) + "-" + v.slice(4);
      el.value = v;
    });
  });

  document.getElementById("areaChangeBtn").addEventListener("click", openLocModal);

  // payment method (Cash / Card) — card only offered for pick-up
  document.querySelectorAll("#payMethods .pay-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      state.payment = opt.dataset.pay;
      saveState();
      reflectPaymentMethod();
      recalcCart();
    });
  });

  // coupon
  document.getElementById("couponApply").addEventListener("click", applyCoupon);
  document.getElementById("coCoupon").addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); applyCoupon(); }
  });

  // GPS in map
  document.getElementById("useGpsBtn").addEventListener("click", () => {
    if (!navigator.geolocation){ showDialog({ icon:"📍", title:"NOT SUPPORTED", body:"Your browser doesn't support location. Please paste a Google Maps link instead." }); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveState();
      const c = document.getElementById("mapCoord");
      c.hidden = false;
      c.querySelector("span").textContent = `${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)} (sent to rider)`;
      mountMap();
    }, err => showDialog({ icon:"📍", title:"LOCATION ERROR", body: err.message }));
  });

  // form submit
  document.getElementById("coForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!validateCheckout()) return;
    placeOrder();
  });

  document.getElementById("confirmDone").addEventListener("click", () => {
    document.getElementById("confirm").hidden = true;
    document.body.classList.remove("state-locked");
    closeCheckout();
    window.scrollTo({ top:0, behavior:"smooth" });
  });
}

async function applyCoupon(){
  const inp = document.getElementById("coCoupon");
  const msg = document.getElementById("couponMsg");
  const btn = document.getElementById("couponApply");
  const code = inp.value.trim().toUpperCase();
  if (!code){
    state.coupon = null;
    state.couponDiscount = 0;
    state.couponLabel = "";
    msg.textContent = "";
    msg.className = "coupon-msg";
    saveState();
    renderCheckoutSummary();
    return;
  }

  // Build minimal cart payload for the RPC
  const cartPayload = state.cart.map(it => {
    const [catId, dishKey] = it.id.split("::");
    return {
      category_id: catId,
      dish_slug:   window.slugifyDish ? window.slugifyDish(it.name) : null,
      custom_id:   it.customId || null,
      price:       it.price,
      qty:         it.qty,
    };
  });

  const origLabel = btn.textContent;
  btn.disabled = true; btn.textContent = "CHECKING…";
  try {
    const { data, error } = await window.db.rpc("validate_coupon",
      { p_code: code, p_cart: cartPayload });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.valid){
      state.coupon = null;
      state.couponDiscount = 0;
      state.couponLabel = "";
      msg.textContent = result?.message || "Invalid coupon";
      msg.className = "coupon-msg bad";
    } else {
      state.coupon = code;
      state.couponDiscount = Number(result.discount_amount) || 0;
      state.couponLabel    = result.label || "Coupon applied";
      msg.textContent = `✓ ${result.label} — saved ${fmtPKR(state.couponDiscount)}`;
      msg.className = "coupon-msg ok";
    }
  } catch (err){
    state.coupon = null;
    state.couponDiscount = 0;
    msg.textContent = "Couldn't validate: " + (err.message || err);
    msg.className = "coupon-msg bad";
  } finally {
    btn.disabled = false; btn.textContent = origLabel;
    saveState();
    renderCheckoutSummary();
  }
}

function validateCheckout(){
  const name  = document.getElementById("coName");
  const phone = document.getElementById("coPhone");
  const email = document.getElementById("coEmail");
  const addr  = document.getElementById("coAddress");
  let ok = true;

  [name, phone, email, addr].forEach(el => el.classList.remove("is-bad"));

  if (name.value.trim().length < 2){ name.classList.add("is-bad"); ok = false; }
  if (!/^03\d{2}-\d{7}$/.test(phone.value.trim())){ phone.classList.add("is-bad"); ok = false; }
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())){ email.classList.add("is-bad"); ok = false; }
  // Address only required for delivery — pick-up has a fixed branch
  if (state.type !== "pickup" && addr.value.trim().length < 6){ addr.classList.add("is-bad"); ok = false; }

  if (!ok){
    const first = document.querySelector(".is-bad");
    first?.scrollIntoView({ behavior:"smooth", block:"center" });
    first?.focus();
  }
  return ok;
}

function renderCheckoutSummary(){
  const t = cartTotals();
  const list = document.getElementById("coSumList");
  list.innerHTML = "";
  state.cart.forEach(i => {
    const row = document.createElement("div");
    row.className = "co-sum-item";
    row.innerHTML = `
      <span class="qty">×${i.qty}</span>
      <div class="nm">${i.name}${i.variant?` (${i.variant})`:""}<small>${fmtPKR(i.price)} each</small></div>
      <span class="pr">${fmtPKR(i.price * i.qty)}</span>
    `;
    list.appendChild(row);
  });
  document.getElementById("coSub").textContent  = fmtPKR(t.sub);
  document.getElementById("coTax").textContent  = fmtPKR(t.tax);
  { const el = document.getElementById("taxPctCo"); if (el) el.textContent = Math.round(t.taxRate * 100); }
  document.getElementById("coDel").textContent  = t.del === 0 ? "FREE" : fmtPKR(t.del);
  document.getElementById("coGrand").textContent= fmtPKR(t.grand);
  const dr = document.getElementById("coDiscRow");
  if (t.discount > 0){
    dr.hidden = false;
    document.getElementById("coDisc").textContent = "−" + fmtPKR(t.discount);
  } else {
    dr.hidden = true;
  }
  document.getElementById("coPlaceTotal").textContent = fmtPKR(t.grand);
}

function mountMap(){
  const box = document.getElementById("mapBox");
  const fallback = document.getElementById("mapFallback");

  if (state.gps && state.gps.lat){
    const c = document.getElementById("mapCoord");
    c.hidden = false;
    c.querySelector("span").textContent = `${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)} (sent to rider)`;
  }

  if (!GOOGLE_MAPS_API_KEY){
    fallback.style.display = "flex";
    return;
  }
  // with API key: embed a map iframe centered on GPS or area
  fallback.style.display = "none";
  const lat = state.gps?.lat || 33.6844; // Islamabad
  const lng = state.gps?.lng || 73.0479;
  const src = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${lat},${lng}&zoom=15`;
  if (!box.querySelector("iframe")){
    const f = document.createElement("iframe");
    f.loading = "lazy"; f.src = src;
    box.appendChild(f);
  } else {
    box.querySelector("iframe").src = src;
  }
}

async function placeOrder(){
  const btn = document.getElementById("placeOrderBtn");
  const originalLabel = btn ? btn.innerHTML : "";
  if (btn){ btn.disabled = true; btn.innerHTML = "PLACING ORDER…"; }

  const t = cartTotals();
  const isPickup = state.type === "pickup";
  const eta = isPickup ? 20 : ETA_MIN;

  const orderRow = {
    order_type:             state.type,
    area:                   isPickup ? "Gulberg Greens (pick-up)" : document.getElementById("coArea").value,
    customer_name:          document.getElementById("coName").value.trim(),
    customer_phone:         document.getElementById("coPhone").value.trim(),
    customer_phone_alt:     document.getElementById("coPhoneAlt").value.trim() || null,
    customer_email:         document.getElementById("coEmail").value.trim() || null,

    delivery_address:       isPickup ? null : (document.getElementById("coAddress").value.trim() || null),
    delivery_landmark:      isPickup ? null : (document.getElementById("coLandmark").value.trim() || null),
    delivery_map_link:      isPickup ? null : (document.getElementById("coMap").value.trim() || null),
    delivery_gps_lat:       isPickup ? null : (state.gps?.lat || null),
    delivery_gps_lng:       isPickup ? null : (state.gps?.lng || null),
    delivery_instructions:  isPickup
                              ? (document.getElementById("coInstrPickup").value.trim() || null)
                              : (document.getElementById("coInstr").value.trim() || null),

    payment_method:         state.payment === "card"
                              ? "card-on-pickup"
                              : (isPickup ? "cash-on-pickup" : "cash-on-delivery"),
    change_request:         state.payment === "cash"
                              ? (document.getElementById("coChange").value.trim() || null)
                              : null,

    subtotal:               Math.round(t.sub),
    tax:                    Math.round(t.tax),
    delivery_fee:           Math.round(t.del),
    coupon_code:            state.coupon || null,
    coupon_discount:        Math.round(t.discount),
    total:                  Math.round(t.grand),

    estimated_minutes:      eta,
  };

  try {
    if (!window.db) throw new Error("Supabase not initialised. Reload the page.");

    // 1. insert the order, get back generated id + order_number
    const { data: order, error: orderErr } = await window.db
      .from("orders")
      .insert(orderRow)
      .select("id, order_number")
      .single();
    if (orderErr) throw orderErr;

    // 2. insert line items in a single batch
    const itemsRows = state.cart.map((c, idx) => ({
      order_id:      order.id,
      dish_name:     c.name,
      dish_category: c.id?.split("::")[0] || null,
      variant:       c.variant || null,
      unit_price:    Math.round(c.price),
      quantity:      c.qty,
      line_total:    Math.round(c.price * c.qty),
      position:      idx,
    }));
    const { error: itemsErr } = await window.db.from("order_items").insert(itemsRows);
    if (itemsErr) throw itemsErr;

    // Clear cart + show confirmation
    state.cart = [];
    state.coupon = null;
    saveState();
    recalcCart();

    document.getElementById("confirmId").textContent = order.order_number;
    const etaEl = document.getElementById("confirmEta");
    if (etaEl) etaEl.textContent = `~${eta} MIN`;
    // Tailor the confirmation message to pick-up vs delivery / cash vs card
    const ctEl = document.getElementById("confirmText");
    if (ctEl){
      if (isPickup){
        ctEl.innerHTML = state.payment === "card"
          ? `A confirmation is on its way to your email. Come collect your order at the counter and <b>pay by card</b> 🙌`
          : `A confirmation is on its way to your email. Come collect your order at the counter and <b>pay cash</b> 🙌`;
      } else {
        ctEl.innerHTML = `A confirmation is on its way to your email. Our rider will call when they're close. Have your <b>cash</b> ready 🙌`;
      }
    }
    // Wire the tracking link with the order number + phone (prefilled)
    const trackEl = document.getElementById("confirmTrack");
    if (trackEl){
      const phoneEnc = encodeURIComponent(orderRow.customer_phone);
      trackEl.href = `/track?o=${order.order_number}&p=${phoneEnc}`;
    }
    document.getElementById("confirm").hidden = false;
    document.body.classList.add("state-locked");
    console.log("[WOK!N] order placed →", order);

    // Meta Pixel — fire Purchase conversion event for ad optimisation
    if (typeof fbq === "function") {
      fbq("track", "Purchase", {
        value:    Math.round(t.grand),
        currency: "PKR",
        contents: itemsRows.map(i => ({ id: i.dish_name, quantity: i.quantity })),
        num_items: itemsRows.reduce((n, i) => n + i.quantity, 0),
      });
    }
  } catch (err) {
    console.error("[WOK!N] order failed:", err);
    showDialog({
      icon: "😔",
      title: "ORDER NOT PLACED",
      body: "Something went wrong on our end — your order was not placed.\n\nPlease call us and we'll take your order right away:\n\n📞 +92 335 5979775\n\nSorry for the trouble!",
      ok: "OK"
    });
  } finally {
    if (btn){ btn.disabled = false; btn.innerHTML = originalLabel; }
  }
}
