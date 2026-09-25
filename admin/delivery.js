/* =====================================================================
   WOK!N  ·  ADMIN · DELIVERY DEALS  ·  delivery.js
   ---------------------------------------------------------------------
   Controls which dishes a customer may choose in a delivery-deal
   dropdown ("half chicken dish" → which chicken dishes?). That's the
   teeth behind the "selected dishes apply" line on every deal.

   Table: public.deal_dish_options (category, dish_names[])
   A category with nothing ticked is stored as no row at all, which the
   customer side reads as "no restriction" — so the deals never end up
   with an empty dropdown.
   ===================================================================== */

const state = { chosen: new Map(), deals: [], dirty: false };

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
  document.getElementById("dlSave").addEventListener("click", save);
  document.getElementById("dlAddDeal").addEventListener("click", addBlankDeal);
  document.getElementById("dlSeed").addEventListener("click", seedDefaults);

  // Don't let a half-made change disappear on a stray back button.
  window.addEventListener("beforeunload", e => {
    if (state.dirty){ e.preventDefault(); e.returnValue = ""; }
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
  await load();
  render();
}

/* ------------------------------------------------------------------ */
/*  DATA                                                              */
/* ------------------------------------------------------------------ */
async function load(){
  await loadDeals();
  state.chosen.clear();
  const { data, error } = await window.db.from("deal_dish_options").select("category,dish_names");
  if (error){
    toast(/deal_dish_options/i.test(error.message || "")
      ? "Run supabase-deal-dishes-migration.sql first"
      : "Couldn't load: " + error.message);
    return;
  }
  (data || []).forEach(r => {
    state.chosen.set(r.category, new Set(Array.isArray(r.dish_names) ? r.dish_names : []));
  });
}

/* ------------------------------------------------------------------ */
/*  THE DEALS                                                         */
/* ------------------------------------------------------------------ */
async function loadDeals(){
  const { data, error } = await window.db.from("delivery_deals")
    .select("*").order("position", { ascending: true });
  if (error){
    toast(/delivery_deals/i.test(error.message || "")
      ? "Run supabase-delivery-deals-migration.sql first"
      : "Couldn't load deals: " + error.message);
    state.deals = [];
    return;
  }
  state.deals = (data || []).map(r => ({
    id: r.id, name: r.name, price: Number(r.price) || 0,
    serves: r.serves || "", hero: r.hero || "",
    items: Array.isArray(r.items) ? r.items : [],
    note: r.note || "", is_popular: r.is_popular === true,
    is_active: r.is_active !== false, position: r.position || 0,
  }));
}

function renderDeals(){
  const wrap = document.getElementById("dlDeals");
  const hint = document.getElementById("dlDealsHint");
  const seed = document.getElementById("dlSeed");
  wrap.innerHTML = "";

  // Nothing saved yet → the site is showing the five built-in deals.
  seed.hidden = state.deals.length > 0;
  hint.innerHTML = state.deals.length
    ? "Drag nothing, just edit. Changes go live when you press Save."
    : "No deals saved yet, so the site is showing the five standard ones built into the code. " +
      "Load them in to start editing, or build your own.";

  state.deals.forEach((deal, i) => wrap.appendChild(dealCard(deal, i)));
}

function dealCard(deal, idx){
  const card = document.createElement("article");
  card.className = "dl-deal" + (deal.is_active ? "" : " is-off");

  /* ---- header: name, price, controls ---- */
  const head = document.createElement("header");
  head.className = "dl-deal-head";

  const name = document.createElement("input");
  name.className = "dl-deal-name";
  name.value = deal.name || "";
  name.placeholder = "Deal name";
  name.addEventListener("input", () => { deal.name = name.value; markDirty(); });
  head.appendChild(name);

  const up = iconBtn("↑", "Move up", () => moveDeal(idx, -1));
  const down = iconBtn("↓", "Move down", () => moveDeal(idx, 1));
  up.disabled = idx === 0;
  down.disabled = idx === state.deals.length - 1;
  head.appendChild(up); head.appendChild(down);

  head.appendChild(toggleBtn(deal.is_popular, "★ POPULAR", "☆ POPULAR", v => { deal.is_popular = v; markDirty(); renderDeals(); }));
  head.appendChild(toggleBtn(deal.is_active, "● LIVE", "○ HIDDEN", v => { deal.is_active = v; markDirty(); renderDeals(); }));

  const del = iconBtn("🗑", "Delete this deal", () => {
    if (!confirm(`Delete "${deal.name}"?\n\nIt disappears from the menu and the QR page when you save.`)) return;
    state.deals.splice(idx, 1);
    markDirty(); renderDeals();
  });
  del.classList.add("dl-del");
  head.appendChild(del);
  card.appendChild(head);

  /* ---- the simple fields ---- */
  const row = document.createElement("div");
  row.className = "dl-deal-fields";
  row.appendChild(field("Price (Rs., before tax)", numberInput(deal.price, v => { deal.price = v; markDirty(); })));
  row.appendChild(field("Serves", textInput(deal.serves, "For 2 people", v => { deal.serves = v; markDirty(); })));
  row.appendChild(field("Photo — which dish", dishSelect(deal.hero, v => { deal.hero = v; markDirty(); })));
  row.appendChild(field("Small print", textInput(deal.note, "Selected dishes apply", v => { deal.note = v; markDirty(); })));
  card.appendChild(row);

  /* ---- what's in it ---- */
  const lbl = document.createElement("h4");
  lbl.className = "dl-items-label";
  lbl.textContent = "What's included";
  card.appendChild(lbl);

  const list = document.createElement("div");
  list.className = "dl-items";
  (deal.items || []).forEach((item, j) => list.appendChild(itemRow(deal, item, j)));
  card.appendChild(list);

  const adds = document.createElement("div");
  adds.className = "dl-item-adds";
  adds.appendChild(smallBtn("+ LINE OF TEXT", () => {
    deal.items.push("Fish crackers"); markDirty(); renderDeals();
  }));
  adds.appendChild(smallBtn("+ CUSTOMER PICKS A DISH", () => {
    deal.items.push({ pick:"poultry", label:"Half chicken dish" }); markDirty(); renderDeals();
  }));
  card.appendChild(adds);

  return card;
}

/* One line of "what's included": either fixed text, or a dropdown the
   customer answers. */
function itemRow(deal, item, j){
  const row = document.createElement("div");
  row.className = "dl-item";
  const isPick = item && typeof item === "object";

  const kind = document.createElement("select");
  kind.className = "dl-item-kind";
  [["text","Text"],["pick","Customer picks"]].forEach(([v,t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t; kind.appendChild(o);
  });
  kind.value = isPick ? "pick" : "text";
  kind.addEventListener("change", () => {
    deal.items[j] = kind.value === "pick"
      ? { pick:"poultry", label: typeof item === "string" ? item : "Half chicken dish" }
      : (isPick ? (item.label || "") : String(item || ""));
    markDirty(); renderDeals();
  });
  row.appendChild(kind);

  if (isPick){
    const cat = document.createElement("select");
    cat.className = "dl-item-cat";
    [["poultry","Chicken"],["beef","Beef"],["rice","Rice"],["noodles","Noodles"],
     ["rice-noodles","Rice or noodles"],["soup","Soup"]].forEach(([v,t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t; cat.appendChild(o);
    });
    cat.value = item.pick || "poultry";
    cat.addEventListener("change", () => { item.pick = cat.value; markDirty(); });
    row.appendChild(cat);

    const lab = textInput(item.label, "Half chicken dish", v => { item.label = v; markDirty(); });
    lab.className = "dl-item-text";
    lab.title = "What the customer reads above the dropdown — say Half or Full here";
    row.appendChild(lab);
  } else {
    const txt = textInput(String(item || ""), "e.g. 2 mint margaritas", v => { deal.items[j] = v; markDirty(); });
    txt.className = "dl-item-text";
    row.appendChild(txt);
  }

  const up = iconBtn("↑", "Move up", () => moveItem(deal, j, -1));
  const down = iconBtn("↓", "Move down", () => moveItem(deal, j, 1));
  up.disabled = j === 0;
  down.disabled = j === deal.items.length - 1;
  row.appendChild(up); row.appendChild(down);

  const rm = iconBtn("✕", "Remove this line", () => { deal.items.splice(j,1); markDirty(); renderDeals(); });
  rm.classList.add("dl-del");
  row.appendChild(rm);
  return row;
}

function moveDeal(i, by){
  const to = i + by;
  if (to < 0 || to >= state.deals.length) return;
  const [d] = state.deals.splice(i, 1);
  state.deals.splice(to, 0, d);
  markDirty(); renderDeals();
}
function moveItem(deal, j, by){
  const to = j + by;
  if (to < 0 || to >= deal.items.length) return;
  const [it] = deal.items.splice(j, 1);
  deal.items.splice(to, 0, it);
  markDirty(); renderDeals();
}

function addBlankDeal(){
  state.deals.push({
    id: "deal-" + Date.now().toString(36),
    name: "New deal", price: 0, serves: "For 2 people", hero: "",
    items: [{ pick:"poultry", label:"Half chicken dish" }],
    note: "Selected dishes apply", is_popular: false, is_active: true,
    position: state.deals.length,
  });
  markDirty(); renderDeals();
}

/* Writes the five deals from delivery-deals.js in as editable rows. */
function seedDefaults(){
  if (state.deals.length && !confirm("This adds the 5 standard deals to what's already here. Continue?")) return;
  DEFAULT_DELIVERY_DEALS.forEach((d, i) => {
    state.deals.push({
      id: d.id, name: d.name, price: d.price, serves: d.serves, hero: d.hero,
      items: JSON.parse(JSON.stringify(d.items)),
      note: d.note || "", is_popular: !!d.popular, is_active: true,
      position: state.deals.length + i,
    });
  });
  markDirty(); renderDeals();
  toast("Loaded — edit them, then Save");
}

/* ---- small builders ---- */
function field(label, input){
  const w = document.createElement("label");
  w.className = "dl-field";
  const s = document.createElement("span");
  s.textContent = label;
  w.appendChild(s); w.appendChild(input);
  return w;
}
function textInput(value, placeholder, onInput){
  const el = document.createElement("input");
  el.type = "text"; el.value = value || ""; el.placeholder = placeholder || "";
  el.addEventListener("input", () => onInput(el.value));
  return el;
}
function numberInput(value, onInput){
  const el = document.createElement("input");
  el.type = "number"; el.min = "0"; el.step = "5"; el.value = value == null ? "" : value;
  el.addEventListener("input", () => onInput(Number(el.value) || 0));
  return el;
}
/* Every dish on the menu — the photo comes from whichever one is chosen. */
function dishSelect(value, onChange){
  const el = document.createElement("select");
  const blank = document.createElement("option");
  blank.value = ""; blank.textContent = "— generic food photo —";
  el.appendChild(blank);
  if (typeof MENU_DATA !== "undefined"){
    MENU_DATA.forEach(cat => {
      const g = document.createElement("optgroup");
      g.label = cat.name;
      cat.items.forEach(d => {
        const o = document.createElement("option");
        o.value = o.textContent = d.name;
        g.appendChild(o);
      });
      el.appendChild(g);
    });
  }
  el.value = value || "";
  el.addEventListener("change", () => onChange(el.value));
  return el;
}
function iconBtn(glyph, title, onClick){
  const b = document.createElement("button");
  b.className = "btn-ghost small dl-icon";
  b.textContent = glyph; b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
function smallBtn(text, onClick){
  const b = document.createElement("button");
  b.className = "btn-ghost small";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
function toggleBtn(on, onText, offText, onChange){
  const b = document.createElement("button");
  b.className = "btn-ghost small dl-toggle" + (on ? " is-on" : "");
  b.textContent = on ? onText : offText;
  b.addEventListener("click", () => onChange(!on));
  return b;
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
function render(){
  renderDeals();
  const wrap = document.getElementById("dlGroups");
  wrap.innerHTML = "";
  DEAL_CATEGORIES.forEach(cat => wrap.appendChild(groupCard(cat)));
  refreshCounts();
}

function groupCard(cat){
  const dishes = allCategoryDishes(cat.id);
  const card = document.createElement("section");
  card.className = "dl-group";
  card.dataset.cat = cat.id;

  const head = document.createElement("header");
  head.className = "dl-group-head";

  const title = document.createElement("div");
  title.className = "dl-group-title";
  const h3 = document.createElement("h3");
  h3.textContent = cat.label;
  const small = document.createElement("small");
  small.textContent = cat.note;
  title.appendChild(h3); title.appendChild(small);
  head.appendChild(title);

  const count = document.createElement("span");
  count.className = "dl-count";
  head.appendChild(count);

  const all = document.createElement("button");
  all.className = "btn-ghost small";
  all.textContent = "ALL";
  all.title = "Offer every dish in this section";
  all.addEventListener("click", () => {
    card.querySelectorAll("input[type=checkbox]").forEach(c => { c.checked = true; });
    markDirty(); refreshCounts();
  });
  head.appendChild(all);

  const none = document.createElement("button");
  none.className = "btn-ghost small";
  none.textContent = "NONE";
  none.title = "Clear this section (which also means: offer everything)";
  none.addEventListener("click", () => {
    card.querySelectorAll("input[type=checkbox]").forEach(c => { c.checked = false; });
    markDirty(); refreshCounts();
  });
  head.appendChild(none);

  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "dl-dishes";
  const picked = state.chosen.get(cat.id);
  dishes.forEach(name => {
    const lab = document.createElement("label");
    lab.className = "dl-dish";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = !!(picked && picked.has(name));
    cb.addEventListener("change", () => { markDirty(); refreshCounts(); });
    const txt = document.createElement("span");
    txt.textContent = name;
    lab.appendChild(cb); lab.appendChild(txt);
    grid.appendChild(lab);
  });
  card.appendChild(grid);

  if (!dishes.length){
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No dishes found in this menu section.";
    card.appendChild(empty);
  }
  return card;
}

/* Says plainly what the customer will see, including the "none ticked
   = everything" rule, so nobody has to remember it. */
function refreshCounts(){
  document.querySelectorAll(".dl-group").forEach(card => {
    const boxes = [...card.querySelectorAll("input[type=checkbox]")];
    const on = boxes.filter(c => c.checked).length;
    const el = card.querySelector(".dl-count");
    if (!on){
      el.textContent = `ALL ${boxes.length} ON OFFER`;
      el.className = "dl-count is-all";
    } else {
      el.textContent = `${on} OF ${boxes.length} ON OFFER`;
      el.className = "dl-count";
    }
  });
}

function markDirty(){
  state.dirty = true;
  const s = document.getElementById("dlStatus");
  s.textContent = "Unsaved changes";
  s.className = "dl-status is-dirty";
}

/* ------------------------------------------------------------------ */
/*  SAVE                                                              */
/* ------------------------------------------------------------------ */
async function save(){
  const btn = document.getElementById("dlSave");

  // A deal with no name or no lines would render as an empty card.
  const broken = state.deals.find(d => !String(d.name || "").trim() || !(d.items || []).length);
  if (broken){
    toast(`"${broken.name || "Untitled deal"}" needs a name and at least one line.`);
    return;
  }

  btn.disabled = true; btn.textContent = "SAVING…";

  const rows = [];
  const clear = [];
  document.querySelectorAll(".dl-group").forEach(card => {
    const names = [...card.querySelectorAll("input[type=checkbox]")]
      .filter(c => c.checked).map(c => c.value);
    // Nothing ticked → drop the row entirely, so the customer side sees
    // "no restriction" rather than an empty dropdown.
    if (names.length) rows.push({ category: card.dataset.cat, dish_names: names, updated_at: new Date().toISOString() });
    else clear.push(card.dataset.cat);
  });

  try {
    // ---- the deals ----
    const dealRows = state.deals.map((d, i) => ({
      id: d.id,
      name: String(d.name).trim(),
      price: Number(d.price) || 0,
      serves: d.serves || null,
      hero: d.hero || null,
      items: d.items || [],
      note: String(d.note || "").trim() || null,
      is_popular: !!d.is_popular,
      is_active: d.is_active !== false,
      position: i,
      updated_at: new Date().toISOString(),
    }));
    if (dealRows.length){
      const { error } = await window.db.from("delivery_deals")
        .upsert(dealRows, { onConflict: "id" });
      if (error) throw error;
    }
    // Anything the user removed from the list is gone from the table too.
    const keep = dealRows.map(r => r.id);
    const delQ = window.db.from("delivery_deals").delete();
    const { error: delErr } = keep.length
      ? await delQ.not("id", "in", `(${keep.map(k => `"${k}"`).join(",")})`)
      : await delQ.neq("id", "\u0000");     // no rows kept → clear them all
    if (delErr) throw delErr;

    // ---- which dishes the dropdowns may offer ----
    if (rows.length){
      const { error } = await window.db.from("deal_dish_options")
        .upsert(rows, { onConflict: "category" });
      if (error) throw error;
    }
    if (clear.length){
      const { error } = await window.db.from("deal_dish_options")
        .delete().in("category", clear);
      if (error) throw error;
    }
    await load();
    state.dirty = false;
    const s = document.getElementById("dlStatus");
    s.textContent = "Saved — live on the site now";
    s.className = "dl-status is-ok";
    toast("✓ Delivery deals updated");
  } catch (err){
    const m = err.message || "";
    toast(/delivery_deals/i.test(m)   ? "Run supabase-delivery-deals-migration.sql first"
        : /deal_dish_options/i.test(m) ? "Run supabase-deal-dishes-migration.sql first"
        : "Save failed: " + m);
  } finally {
    btn.disabled = false; btn.textContent = "SAVE CHANGES";
  }
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}
