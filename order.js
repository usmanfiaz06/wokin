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
  "Capital Enclave",
  "Ghauri Model Town",
  "Ghauri Town",
  "Ghauri Town Phase 1",
  "Ghauri Town Phase 2",
  "Ghauri Town Phase 3",
  "Ghauri Town Phase 4",
  "Ghauri Town Phase 4 A",
  "Ghauri Town Phase 4 B",
  "Ghauri Town Phase 4C/1",
  "Ghauri Town Phase 5",
  "Ghauri Town Phase 5 A",
  "Ghauri Town Phase 5 B",
  "Ghauri Town Phase 7",
  "Ghauri Town VIP",
  "Gulberg Green Block A",
  "Gulberg Green Block B",
  "Gulberg Green Block C",
  "Gulberg Green Block D",
  "Gulberg Green Block E",
  "Gulberg Greens",
  "Gulberg Residencia",
  "Gulberg Residencia A",
  "Gulberg Residencia B",
  "Gulberg Residencia C",
  "Gulberg Residencia F",
  "Gulberg Residencia G",
  "Gulberg Residencia H",
  "Gulberg Residencia I",
  "Gulberg Residencia J",
  "Gulberg Residencia K",
  "Gulberg Residencia L",
  "Gulberg Residencia M",
  "Gulberg Residencia N",
  "Gulberg Residencia O",
  "Gulberg Residencia P",
  "Gulberg Residencia Q",
  "Gulberg Residencia R",
  "Gulberg Residencia S",
  "Jinnah Garden",
  "Koral Town",
  "Naval Anchorage",
  "Naval Anchorage B",
  "Naval Anchorage C",
  "Naval Anchorage D",
  "Naval Anchorage E",
  "Naval Anchorage F",
  "Naval Anchorage G",
  "Panwal Shareef",
];

const TAX_RATE       = 0.15;
const DELIVERY_FEE   = 100;
const FREE_THRESHOLD = 1800;
const ETA_MIN        = 45;

const COUPONS = {
  WOKIN10:   { type: "percent", value: 10, label: "10% off (welcome)"    },
  FRESH15:   { type: "percent", value: 15, label: "15% off your meal"    },
  WOKHOUSE:  { type: "flat",    value: 250, label: "Rs. 250 off"          },
};

const fmtPKR = n => "Rs. " + Math.round(n).toLocaleString("en-PK");

/* ------------------------------------------------------------------ */
/*  STATE (persisted in localStorage)                                  */
/* ------------------------------------------------------------------ */
const LS_KEY = "wokin_order_state_v1";
const state = loadState() || {
  type: null,        // 'delivery' | 'pickup'
  area: null,        // string or null
  cart: [],          // { id, name, desc, image, price, qty, variant }
  coupon: null,
};

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
document.addEventListener("DOMContentLoaded", () => {
  populateAreaSelect();
  bindLocationModal();
  bindTopBar();
  bindCart();
  bindSearch();
  bindCheckout();
  renderMenu();
  renderPopular();
  syncBarLocation();
  recalcCart();

  if (state.type && state.area) {
    closeLocModal();
  } else {
    openLocModal();
  }
});


/* ==================================================================
   LOCATION MODAL
=================================================================== */
function openLocModal(){
  document.getElementById("locModal").classList.remove("is-hidden");
  document.body.classList.add("state-locked");
  // restore prior choices if any
  if (state.type) selectTypeCard(state.type, false);
  if (state.area) {
    showLocStep(2);
    highlightArea(state.area);
  } else {
    showLocStep(1);
  }
}
function closeLocModal(){
  document.getElementById("locModal").classList.add("is-hidden");
  document.body.classList.remove("state-locked");
}

function showLocStep(n){
  document.querySelectorAll(".loc-step").forEach(el => {
    el.hidden = (Number(el.dataset.step) !== n);
  });
}
function selectTypeCard(type, advance = true){
  state.type = type;
  saveState();
  document.querySelectorAll(".type-card").forEach(c => {
    c.classList.toggle("is-selected", c.dataset.type === type);
  });
  document.getElementById("locType2Echo").textContent = type === "pickup" ? "PICK-UP" : "DELIVERY";
  document.getElementById("barTypeLabel").textContent = type === "pickup" ? "PICK-UP FROM" : "DELIVERY TO";
  if (advance) setTimeout(() => showLocStep(2), 220);
}

function bindLocationModal(){
  document.querySelectorAll(".type-card").forEach(card => {
    card.addEventListener("click", () => selectTypeCard(card.dataset.type, true));
  });
  document.getElementById("locBack").addEventListener("click", () => showLocStep(1));

  document.getElementById("locGpsBtn").addEventListener("click", handleGps);

  // search filter
  document.getElementById("areaSearch").addEventListener("input", e => {
    renderAreaList(e.target.value);
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
    li.innerHTML = `<span>${area}</span><small>Tap to select →</small>`;
    if (state.area === area) li.classList.add("is-active");
    li.addEventListener("click", () => chooseArea(area));
    ul.appendChild(li);
  });
}

function highlightArea(area){
  document.querySelectorAll("#areaList li").forEach(li => {
    li.classList.toggle("is-active", li.dataset.area === area);
  });
}

function chooseArea(area){
  state.area = area;
  saveState();
  syncBarLocation();
  // also reflect in checkout select if rendered
  const sel = document.getElementById("coArea");
  if (sel) sel.value = area;
  setTimeout(closeLocModal, 220);
}

function handleGps(){
  const btn = document.getElementById("locGpsBtn");
  if (!navigator.geolocation){
    alert("Your browser doesn't support location detection — please pick from the list.");
    return;
  }
  btn.querySelector("b").textContent = "FINDING YOU…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      // For now we don't reverse-geocode (would need Google Maps API key).
      // We pick the first area in the list and let the user confirm/change.
      btn.querySelector("b").textContent = "USE MY CURRENT LOCATION";
      const guess = DELIVERY_AREAS[0];
      const ok = confirm(`We've got your location.\nNearest serviceable area we deliver to: ${guess}.\n\nUse this area? You can change it later in checkout.`);
      if (ok) {
        // store coords for checkout map
        state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        chooseArea(guess);
      }
    },
    err => {
      btn.querySelector("b").textContent = "USE MY CURRENT LOCATION";
      alert("Couldn't get your location: " + err.message + "\nPick from the list instead.");
    },
    { enableHighAccuracy:true, timeout:8000 }
  );
}

function syncBarLocation(){
  document.getElementById("barTypeLabel").textContent =
    state.type === "pickup" ? "PICK-UP FROM" : (state.type ? "DELIVERY TO" : "CHOOSE");
  document.getElementById("barAreaLabel").textContent = state.area || "— pick an area —";
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
}


/* ==================================================================
   MENU RENDER
=================================================================== */
function renderMenu(){
  const root = document.getElementById("menuRoot");
  const nav  = document.getElementById("catNavInner");

  // skip beverages if you want? we'll keep them; they have their own section
  MENU_DATA.forEach(cat => {
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
    cat.items.forEach((dish, idx) => {
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
  const img = getDishImage(dish.name, cat.id);
  const initial = dish.name.charAt(0);
  const tagsHtml = (dish.tags||[]).map(t => `<span class="dish-tag ${t}">${tagLabel(t)}</span>`).join("");

  const card = document.createElement("article");
  card.className = "dish-card";
  card.dataset.id = id;

  const hasFull = dish.priceFull && dish.priceFull !== dish.price;

  card.innerHTML = `
    <div class="img" data-initial="${initial}" style="background-image:url('${img}')">
      <div class="img-tags">${tagsHtml}</div>
    </div>
    <div class="pad">
      <h3>${dish.name}</h3>
      ${dish.pcs ? `<span class="pcs">${dish.pcs}</span>`:""}
      <p>${dish.desc||""}</p>
      <div class="foot">
        <div class="prices">
          <span class="price-half">${fmtPKR(dish.price)}${dish.smallLabel?` <em>· ${dish.smallLabel}</em>`:""}</span>
          ${hasFull ? `<span class="price-full">Full ${fmtPKR(dish.priceFull)}</span>`:""}
        </div>
        <div class="action"></div>
      </div>
    </div>
  `;

  // image load fallback — hide broken image so the typographic backdrop shows
  const imgEl = new Image();
  imgEl.src = img;
  imgEl.onerror = () => {
    card.querySelector(".img").style.backgroundImage = "none";
  };

  // wire add button
  refreshDishAction(card, dish, cat);
  return card;
}

function refreshDishAction(card, dish, cat){
  const id     = makeDishId(dish, cat);
  const item   = state.cart.find(c => c.id === id);
  const action = card.querySelector(".action");
  action.innerHTML = "";

  if (item){
    const stepper = document.createElement("div");
    stepper.className = "stepper";
    stepper.innerHTML = `
      <button aria-label="Decrease">−</button>
      <b>${item.qty}</b>
      <button aria-label="Increase">+</button>
    `;
    stepper.querySelectorAll("button")[0].addEventListener("click", () => { changeQty(id, -1); refreshDishAction(card, dish, cat); });
    stepper.querySelectorAll("button")[1].addEventListener("click", () => { changeQty(id, +1); refreshDishAction(card, dish, cat); });
    action.appendChild(stepper);
  } else {
    const btn = document.createElement("button");
    btn.className = "add-btn";
    btn.textContent = "ADD +";
    btn.addEventListener("click", () => {
      addToCart(dish, cat);
      refreshDishAction(card, dish, cat);
      bumpCartIcon();
    });
    action.appendChild(btn);
  }
}

function tagLabel(t){
  return ({ chef:"CHEF'S", veg:"VEG", spicy:"SPICY", mild:"MILD" })[t] || t.toUpperCase();
}

function makeDishId(dish, cat){
  return cat.id + "::" + dish.name.replace(/\s+/g,"_");
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

function renderPopular(){
  const scroll = document.getElementById("popularScroll");
  POPULAR_DISH_NAMES.forEach(nm => {
    const hit = findDishByName(nm);
    if (!hit) return;
    const { dish, cat } = hit;
    const img = getDishImage(dish.name, cat.id);
    const card = document.createElement("div");
    card.className = "pop-card";
    card.innerHTML = `
      <div class="img" style="background-image:url('${img}')"></div>
      <div class="pad">
        <h4>${dish.name}</h4>
        <p style="font-size:11px; color:var(--mute); margin:2px 0 0;">${(dish.desc||"").slice(0,68)}…</p>
        <div class="price">
          <b>${fmtPKR(dish.price)}</b>
          <button class="add" aria-label="Add to cart">+</button>
        </div>
      </div>
    `;
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
function addToCart(dish, cat){
  const id = makeDishId(dish, cat);
  const existing = state.cart.find(c => c.id === id);
  if (existing){ existing.qty += 1; }
  else {
    state.cart.push({
      id,
      name: dish.name,
      desc: dish.pcs || "",
      image: getDishImage(dish.name, cat.id),
      price: dish.price,
      qty: 1,
    });
  }
  saveState();
  recalcCart();
}

function changeQty(id, delta){
  const item = state.cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(c => c.id !== id);
  saveState();
  recalcCart();
  // refresh corresponding dish card stepper, if open
  document.querySelectorAll(`.dish-card[data-id="${CSS.escape(id)}"]`).forEach(card => {
    const [catId] = id.split("::");
    const cat = MENU_DATA.find(c => c.id === catId);
    if (!cat) return;
    const dish = cat.items.find(d => makeDishId(d, cat) === id);
    if (dish) refreshDishAction(card, dish, cat);
  });
}

function removeItem(id){
  state.cart = state.cart.filter(c => c.id !== id);
  saveState();
  recalcCart();
  document.querySelectorAll(`.dish-card[data-id="${CSS.escape(id)}"]`).forEach(card => {
    const [catId] = id.split("::");
    const cat = MENU_DATA.find(c => c.id === catId);
    if (!cat) return;
    const dish = cat.items.find(d => makeDishId(d, cat) === id);
    if (dish) refreshDishAction(card, dish, cat);
  });
}

function cartTotals(){
  const sub = state.cart.reduce((s,i) => s + i.price * i.qty, 0);
  const tax = sub * TAX_RATE;
  const isFreeDel = sub >= FREE_THRESHOLD || state.type === "pickup";
  const del = (state.type === "pickup") ? 0 : (isFreeDel ? 0 : DELIVERY_FEE);
  // coupon
  let discount = 0;
  if (state.coupon && COUPONS[state.coupon]){
    const c = COUPONS[state.coupon];
    discount = c.type === "percent" ? sub * c.value / 100 : c.value;
    discount = Math.min(discount, sub);
  }
  const grand = Math.max(0, sub - discount) + tax + del;
  return { sub, tax, del, discount, grand, isFreeDel };
}

function recalcCart(){
  const t = cartTotals();
  const qty = state.cart.reduce((s,i)=>s+i.qty,0);

  // bar badge
  const badge = document.getElementById("cartBadge");
  badge.textContent = qty;
  badge.classList.toggle("is-empty", qty === 0);

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
      <div class="img" style="background-image:url('${item.image}')"></div>
      <div class="info">
        <b>${item.name}</b>
        ${item.desc?`<small>${item.desc}</small>`:""}
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
    list.appendChild(row);
  });
  list.querySelectorAll(".stepper button").forEach(b => {
    b.addEventListener("click", () => changeQty(b.dataset.id, Number(b.dataset.d)));
  });
  list.querySelectorAll(".remove").forEach(a => {
    a.addEventListener("click", e => { e.preventDefault(); removeItem(a.dataset.id); });
  });

  // upsell
  renderUpsell();

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
  const picks = POPULAR_DISH_NAMES
    .map(n => findDishByName(n))
    .filter(Boolean)
    .filter(({ dish, cat }) => !inCart.has(makeDishId(dish, cat)))
    .slice(0, 6);

  picks.forEach(({ dish, cat }) => {
    const card = document.createElement("div");
    card.className = "up-card";
    card.innerHTML = `
      <div class="img" style="background-image:url('${getDishImage(dish.name, cat.id)}')"></div>
      <div class="pad">
        <b>${dish.name}</b>
        <div class="row">
          <span>${fmtPKR(dish.price)}</span>
          <button class="add" aria-label="Add">+</button>
        </div>
      </div>
    `;
    card.querySelector(".add").addEventListener("click", () => addToCart(dish, cat));
    scroll.appendChild(card);
  });
}

function openCart(){
  document.getElementById("cartDrawer").classList.add("is-on");
  document.getElementById("scrim").hidden = false;
  setTimeout(() => document.getElementById("scrim").classList.add("is-on"), 10);
  document.body.classList.add("state-locked");
}
function closeCart(){
  document.getElementById("cartDrawer").classList.remove("is-on");
  document.getElementById("scrim").classList.remove("is-on");
  setTimeout(() => { document.getElementById("scrim").hidden = true; }, 280);
  document.body.classList.remove("state-locked");
}
function bindCart(){
  document.getElementById("cartClose").addEventListener("click", closeCart);
  document.getElementById("scrim").addEventListener("click", closeCart);
  document.getElementById("emptyBrowseBtn").addEventListener("click", () => {
    closeCart();
    document.querySelector(".cat-nav")?.scrollIntoView({ behavior:"smooth" });
  });
  document.getElementById("checkoutBtn").addEventListener("click", openCheckout);
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
    const card = document.createElement("div");
    card.className = "pop-card";
    card.innerHTML = `
      <div class="img" style="background-image:url('${getDishImage(dish.name, cat.id)}')"></div>
      <div class="pad">
        <h4>${dish.name}</h4>
        <p style="font-size:11px; color:var(--mute); margin:2px 0 0;">${(dish.desc||"").slice(0,76)}…</p>
        <div class="price"><b>${fmtPKR(dish.price)}</b><button class="add">+</button></div>
      </div>
    `;
    card.querySelector(".add").addEventListener("click", () => addToCart(dish, cat));
    results.appendChild(card);
  });
}


/* ==================================================================
   CHECKOUT
=================================================================== */
function openCheckout(){
  if (!state.cart.length){
    alert("Your cart is empty. Add something tasty first.");
    return;
  }
  if (!state.area && state.type !== "pickup"){
    openLocModal();
    return;
  }
  closeCart();
  populateAreaSelect();
  document.getElementById("coArea").value = state.area || DELIVERY_AREAS[0];
  document.getElementById("checkout").hidden = false;
  document.body.classList.add("state-locked");
  document.getElementById("checkout").scrollTo(0,0);
  renderCheckoutSummary();
  mountMap();
}
function closeCheckout(){
  document.getElementById("checkout").hidden = true;
  document.body.classList.remove("state-locked");
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

  // coupon
  document.getElementById("couponApply").addEventListener("click", applyCoupon);
  document.getElementById("coCoupon").addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); applyCoupon(); }
  });

  // GPS in map
  document.getElementById("useGpsBtn").addEventListener("click", () => {
    if (!navigator.geolocation){ alert("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveState();
      const c = document.getElementById("mapCoord");
      c.hidden = false;
      c.querySelector("span").textContent = `${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)} (sent to rider)`;
      mountMap();
    }, err => alert(err.message));
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

function applyCoupon(){
  const inp = document.getElementById("coCoupon");
  const msg = document.getElementById("couponMsg");
  const code = inp.value.trim().toUpperCase();
  if (!code){ msg.textContent = ""; msg.className = "coupon-msg"; return; }
  const c = COUPONS[code];
  if (!c){
    state.coupon = null;
    msg.textContent = `"${code}" isn't a valid code.`;
    msg.className = "coupon-msg bad";
  } else {
    state.coupon = code;
    msg.textContent = `✓ Applied: ${c.label}`;
    msg.className = "coupon-msg ok";
  }
  saveState();
  renderCheckoutSummary();
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
  if (addr.value.trim().length < 6){ addr.classList.add("is-bad"); ok = false; }

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
      <div class="nm">${i.name}<small>${fmtPKR(i.price)} each</small></div>
      <span class="pr">${fmtPKR(i.price * i.qty)}</span>
    `;
    list.appendChild(row);
  });
  document.getElementById("coSub").textContent  = fmtPKR(t.sub);
  document.getElementById("coTax").textContent  = fmtPKR(t.tax);
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

function placeOrder(){
  const order = {
    id: "WK" + Date.now().toString(36).toUpperCase().slice(-6),
    when: new Date().toISOString(),
    type: state.type,
    area: document.getElementById("coArea").value,
    customer: {
      name:      document.getElementById("coName").value.trim(),
      phone:     document.getElementById("coPhone").value.trim(),
      phoneAlt:  document.getElementById("coPhoneAlt").value.trim(),
      email:     document.getElementById("coEmail").value.trim(),
    },
    delivery: {
      address:   document.getElementById("coAddress").value.trim(),
      landmark:  document.getElementById("coLandmark").value.trim(),
      mapLink:   document.getElementById("coMap").value.trim(),
      gps:       state.gps || null,
      instructions: document.getElementById("coInstr").value.trim(),
    },
    payment: {
      method:        "cash-on-delivery",
      changeRequest: document.getElementById("coChange").value.trim(),
    },
    coupon: state.coupon || null,
    items:  state.cart,
    totals: cartTotals(),
    eta:    state.type === "pickup" ? 20 : ETA_MIN,
  };

  // Persist last order so admin side can pick it up later (next task)
  try {
    const all = JSON.parse(localStorage.getItem("wokin_orders") || "[]");
    all.push(order);
    localStorage.setItem("wokin_orders", JSON.stringify(all));
  } catch(e){}

  // Clear cart
  state.cart = [];
  state.coupon = null;
  saveState();
  recalcCart();

  // Show confirmation
  document.getElementById("confirmId").textContent = order.id;
  document.getElementById("confirm").hidden = false;
  document.body.classList.add("state-locked");
  console.log("[WOK!N] order placed →", order);
}
