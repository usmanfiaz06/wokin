/* =====================================================================
   WOK!N · DINE-IN TABLE PAGE  ·  table.js
   ---------------------------------------------------------------------
   Scan a table QR → browse the menu → order to the table → watch status
   → call the waiter. Frictionless: no name/phone, pay in person.
   ===================================================================== */

const fmtPKR = n => "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-PK");
const TAX_RATE = 0.15;
const LS_KEY = () => "wokin_table_cart_" + (TABLE ? TABLE.token : "x");

let TABLE = null;
let cart = [];
let orderSub = null;

document.addEventListener("DOMContentLoaded", boot);

async function boot(){
  const token = new URLSearchParams(location.search).get("t");
  if (!token || !window.db || typeof MENU_DATA === "undefined") return showError();
  let t = null;
  try {
    const { data } = await window.db.from("restaurant_tables").select("*").eq("token", token).limit(1);
    t = (data || [])[0];
  } catch(e){ return showError(); }
  if (!t || t.is_active === false) return showError();
  TABLE = t;
  // log the scan (fire & forget)
  try { window.db.from("qr_scans").insert({ token }).then(function(){}, function(){}); } catch(e){}
  // takeaway / delivery QR → send to the normal ordering site
  if (t.kind !== "dine-in"){ location.replace("/"); return; }

  await loadMenu();
  restoreCart();
  document.getElementById("tTable").textContent = t.label;
  renderCats();
  renderMenu();
  renderCartBar();
  wire();
  document.getElementById("tLoading").hidden = true;
  document.getElementById("tApp").hidden = false;
}

function showError(){
  const l = document.getElementById("tLoading"); if (l) l.hidden = true;
  const e = document.getElementById("tError"); if (e) e.hidden = false;
}

/* ---- menu data (apply admin overrides) ---- */
async function loadMenu(){
  const ov = {};
  try {
    const { data } = await window.db.from("menu_overrides").select("*");
    (data || []).forEach(o => { ov[o.dish_slug] = o; });
  } catch(e){}
  MENU_DATA.forEach(function (cat){
    cat.items.forEach(function (d){
      const o = window.slugifyDish ? ov[window.slugifyDish(d.name)] : null;
      d._available = o ? o.is_available !== false : true;
      d._hidden    = o ? o.is_hidden === true : false;
      d._price     = (o && o.price_override      != null) ? Number(o.price_override)      : d.price;
      d._priceHalf = (o && o.price_half_override != null) ? Number(o.price_half_override) : d.priceHalf;
      d._priceFull = (o && o.price_full_override != null) ? Number(o.price_full_override) : d.priceFull;
      d._desc      = (o && o.description_override) ? o.description_override : (d.desc || "");
      d._imgPath   = (o && o.image_path) ? o.image_path : null;
    });
  });
}

function supaImg(p){ return p ? (window.SUPABASE_URL || "").replace(/\/$/, "") + "/storage/v1/object/public/dish-images/" + p : null; }
function applyBg(el, d){
  const generic = "/" + (window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp");
  el.style.backgroundImage = 'url("' + generic + '")';
  const cands = d._imgPath ? ["/dish-uploads/" + d._imgPath, supaImg(d._imgPath)]
                           : [window.getDishImage ? window.getDishImage(d.name) : generic];
  let i = 0;
  (function next(){
    if (i >= cands.length) return;
    const u = cands[i++]; const im = new Image();
    im.onload = function(){ el.style.backgroundImage = 'url("' + u + '")'; };
    im.onerror = next; im.src = u;
  })();
}
function variantsOf(d){
  const price = d._price != null ? d._price : d.price;
  const ph = d._priceHalf != null ? d._priceHalf : d.priceHalf;
  const pf = d._priceFull != null ? d._priceFull : d.priceFull;
  if (ph != null && pf != null) return [{ key:"single", label:"Single", price:price }, { key:"half", label:"Half", price:ph }, { key:"full", label:"Full", price:pf }];
  if (pf && pf !== price) return [{ key:"half", label:"Half", price:price }, { key:"full", label:"Full", price:pf }];
  return [{ key:null, label:"", price:price }];
}
function dishId(cat, d, vkey){ return cat.id + "::" + d.name.replace(/\s+/g, "_") + (vkey ? "::" + vkey : ""); }

/* ---- render ---- */
function visibleCats(){ return MENU_DATA.filter(c => c.items.some(d => !d._hidden)); }

function renderCats(){
  const nav = document.getElementById("tCats");
  nav.innerHTML = "";
  visibleCats().forEach(function (cat){
    const b = document.createElement("button");
    b.textContent = cat.name;
    b.addEventListener("click", function (){
      const sec = document.getElementById("tsec-" + cat.id);
      if (sec) sec.scrollIntoView({ behavior:"smooth", block:"start" });
    });
    nav.appendChild(b);
  });
}

function renderMenu(){
  const root = document.getElementById("tMenu");
  root.innerHTML = "";
  visibleCats().forEach(function (cat){
    const vis = cat.items.filter(d => !d._hidden);
    if (!vis.length) return;
    const sec = document.createElement("section");
    sec.className = "t-sec"; sec.id = "tsec-" + cat.id;
    sec.innerHTML = "<h2>" + cat.name + "</h2>";
    vis.forEach(function (d){ sec.appendChild(dishRow(d, cat)); });
    root.appendChild(sec);
  });
}

function dishRow(d, cat){
  const row = document.createElement("div");
  row.className = "t-dish";
  const img = document.createElement("div"); img.className = "img"; applyBg(img, d);
  const info = document.createElement("div"); info.className = "info";
  const h = document.createElement("h3"); h.textContent = d.name; info.appendChild(h);
  if (d._desc){ const p = document.createElement("p"); p.textContent = d._desc; info.appendChild(p); }
  const rowc = document.createElement("div"); rowc.className = "row";
  const vars = variantsOf(d);
  const price = document.createElement("span"); price.className = "price";
  price.textContent = (vars.length > 1 ? "From " : "") + fmtPKR(vars[0].price);
  rowc.appendChild(price);
  const act = document.createElement("div");
  if (d._available === false){
    const s = document.createElement("span"); s.className = "t-sold"; s.textContent = "SOLD OUT"; act.appendChild(s);
  } else if (vars.length > 1){
    act.className = "t-sizes";
    vars.forEach(function (v){
      const bt = document.createElement("button"); bt.className = "t-add"; bt.textContent = v.label.toUpperCase();
      bt.addEventListener("click", function (){ addItem(d, cat, v); });
      act.appendChild(bt);
    });
  } else {
    const id = dishId(cat, d, null);
    const it = cart.find(c => c.id === id);
    if (it){ act.appendChild(stepper(id)); }
    else {
      const bt = document.createElement("button"); bt.className = "t-add"; bt.textContent = "ADD";
      bt.addEventListener("click", function (){ addItem(d, cat, vars[0]); refreshRow(cat, d); });
      act.appendChild(bt);
    }
  }
  rowc.appendChild(act); info.appendChild(rowc);
  row.appendChild(img); row.appendChild(info);
  row.dataset.rid = cat.id + "::" + d.name.replace(/\s+/g, "_");
  return row;
}
function refreshRow(cat, d){
  const base = cat.id + "::" + d.name.replace(/\s+/g, "_");
  document.querySelectorAll('.t-dish[data-rid="' + CSS.escape(base) + '"]').forEach(function (old){
    old.replaceWith(dishRow(d, cat));
  });
}
function stepper(id){
  const it = cart.find(c => c.id === id);
  const wrap = document.createElement("div"); wrap.className = "t-step";
  const minus = document.createElement("button"); minus.textContent = "−";
  const b = document.createElement("b"); b.textContent = it ? it.qty : 0;
  const plus = document.createElement("button"); plus.textContent = "+";
  minus.addEventListener("click", function (){ changeQty(id, -1); });
  plus.addEventListener("click", function (){ changeQty(id, +1); });
  wrap.appendChild(minus); wrap.appendChild(b); wrap.appendChild(plus);
  return wrap;
}

/* ---- cart ---- */
function addItem(d, cat, v){
  const id = dishId(cat, d, v.key);
  const it = cart.find(c => c.id === id);
  if (it) it.qty += 1;
  else cart.push({ id:id, name:d.name, variant:v.label || null, price:v.price, qty:1, catId:cat.id });
  saveCart(); renderCartBar(); toast("Added " + d.name + (v.label ? " ("+v.label+")" : ""));
}
function changeQty(id, delta){
  const it = cart.find(c => c.id === id);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) cart = cart.filter(c => c.id !== id);
  saveCart(); renderCartBar(); renderMenu(); renderCartList();
}
function cartTotals(){
  const sub = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const tax = Math.round(sub * TAX_RATE);
  return { sub:Math.round(sub), tax:tax, total:Math.round(sub) + tax, qty:cart.reduce((s,i)=>s+i.qty,0) };
}
function renderCartBar(){
  const bar = document.getElementById("tCartBar");
  const t = cartTotals();
  if (!t.qty){ bar.hidden = true; return; }
  document.getElementById("tCartCount").textContent = t.qty;
  document.getElementById("tCartTotal").textContent = fmtPKR(t.total);
  bar.hidden = false;
}
function renderCartList(){
  const list = document.getElementById("tCartList");
  list.innerHTML = "";
  cart.forEach(function (it){
    const row = document.createElement("div"); row.className = "t-ci";
    const nm = document.createElement("div"); nm.className = "ci-name";
    nm.innerHTML = "<span></span>" + (it.variant ? "<small>" + it.variant + "</small>" : "");
    nm.querySelector("span").textContent = it.name;
    const st = stepper(it.id);
    const pr = document.createElement("span"); pr.className = "ci-price"; pr.textContent = fmtPKR(it.price * it.qty);
    row.appendChild(nm); row.appendChild(st); row.appendChild(pr);
    list.appendChild(row);
  });
  document.getElementById("tGrand").textContent = fmtPKR(cartTotals().total);
}
function saveCart(){ try { localStorage.setItem(LS_KEY(), JSON.stringify(cart)); } catch(e){} }
function restoreCart(){ try { cart = JSON.parse(localStorage.getItem(LS_KEY()) || "[]") || []; } catch(e){ cart = []; } }

/* ---- wiring ---- */
function wire(){
  document.getElementById("tCartBar").addEventListener("click", function (){ renderCartList(); document.getElementById("tSheet").hidden = false; });
  document.getElementById("tSheetClose").addEventListener("click", function (){ document.getElementById("tSheet").hidden = true; });
  document.getElementById("tSheet").addEventListener("click", function (e){ if (e.target.id === "tSheet") document.getElementById("tSheet").hidden = true; });
  document.getElementById("tPlace").addEventListener("click", placeOrder);
  document.getElementById("tWaiter").addEventListener("click", callWaiter);
  document.getElementById("tMore").addEventListener("click", function (){ document.getElementById("tStatus").hidden = true; });
}

/* ---- place order ---- */
async function placeOrder(){
  if (!cart.length){ toast("Add something first."); return; }
  const btn = document.getElementById("tPlace"); btn.disabled = true; const orig = btn.textContent; btn.textContent = "PLACING…";
  const t = cartTotals();
  const note = document.getElementById("tNote").value.trim() || null;
  const orderRow = {
    order_type:"dine-in", table_label:TABLE.label, area:TABLE.label,
    customer_name:TABLE.label, customer_phone:"-",
    payment_method:"pay-at-table", delivery_instructions:note,
    subtotal:t.sub, tax:t.tax, delivery_fee:0, total:t.total, estimated_minutes:20,
  };
  try {
    const { data:order, error } = await window.db.from("orders").insert(orderRow).select().single();
    if (error) throw error;
    const items = cart.map(function (c, idx){ return {
      order_id:order.id, dish_name:c.name, dish_category:c.catId, variant:c.variant || null,
      unit_price:Math.round(c.price), quantity:c.qty, line_total:Math.round(c.price * c.qty), position:idx }; });
    const { error: ie } = await window.db.from("order_items").insert(items);
    if (ie) throw ie;
    cart = []; saveCart(); renderCartBar();
    document.getElementById("tNote").value = "";
    document.getElementById("tSheet").hidden = true;
    showStatus(order);
    subscribeOrder(order.id);
  } catch(err){
    toast("Couldn't place order: " + (err.message || err));
  } finally { btn.disabled = false; btn.textContent = orig; }
}

/* ---- status ---- */
const STEPS = [
  { key:"new",       label:"Order received" },
  { key:"accepted",  label:"Confirmed by kitchen" },
  { key:"cooking",   label:"Cooking" },
  { key:"ready",     label:"Ready / being served" },
  { key:"delivered", label:"Served — enjoy!" },
];
function showStatus(order){
  document.getElementById("tStatusNum").textContent = "Order #" + order.order_number + " · " + TABLE.label;
  renderSteps(order.status);
  const w = document.getElementById("tWaiter"); w.classList.remove("called"); w.textContent = "🔔 CALL WAITER";
  document.getElementById("tStatus").hidden = false;
}
function renderSteps(status){
  const box = document.getElementById("tSteps");
  if (status === "cancelled"){
    box.innerHTML = '<div class="t-stepline cur">✕ This order was cancelled — please call the waiter.</div>';
    return;
  }
  const idx = STEPS.findIndex(s => s.key === status);
  box.innerHTML = STEPS.map(function (s, i){
    const cls = i < idx ? "done" : (i === idx ? "cur" : "");
    const mark = i < idx ? "✓" : (i === idx ? "●" : "○");
    return '<div class="t-stepline ' + cls + '"><span>' + mark + '</span> ' + s.label + '</div>';
  }).join("");
}
function subscribeOrder(id){
  try { if (orderSub) orderSub.unsubscribe(); } catch(e){}
  orderSub = window.db.channel("order-" + id)
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"orders", filter:"id=eq." + id },
        function (payload){ if (payload.new) renderSteps(payload.new.status); })
    .subscribe();
}

/* ---- call waiter ---- */
async function callWaiter(){
  const w = document.getElementById("tWaiter");
  try { await window.db.from("waiter_calls").insert({ table_label:TABLE.label }); }
  catch(e){ toast("Couldn't call — please wave us down!"); return; }
  w.classList.add("called"); w.textContent = "✓ WAITER CALLED";
  toast("A waiter is on the way 🙌");
  setTimeout(function (){ w.classList.remove("called"); w.textContent = "🔔 CALL WAITER"; }, 6000);
}

/* ---- toast ---- */
let _tt;
function toast(msg){
  const el = document.getElementById("tToast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_tt); _tt = setTimeout(function (){ el.hidden = true; }, 2200);
}
