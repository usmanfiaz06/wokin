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

const state = { chosen: new Map(), dirty: false };

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
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
function render(){
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
    toast("✓ Deal dishes updated");
  } catch (err){
    toast(/deal_dish_options/i.test(err.message || "")
      ? "Run supabase-deal-dishes-migration.sql first"
      : "Save failed: " + err.message);
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
