/* =====================================================================
   WOK!N  ·  ADMIN · MENU MANAGEMENT  ·  menu.js
   ---------------------------------------------------------------------
   - Lists every dish from the static menu (menu-data.js)
   - Overlays live overrides from the menu_overrides table
   - Toggle availability inline (instant save, optimistic UI)
   - Click a dish → edit price / full price / description / portion
   - "Reset all overrides" wipes the entire table back to defaults
   - Realtime: another admin's edit propagates instantly
   ===================================================================== */

const fmtPKR = n => "Rs. " + Math.round(Number(n)||0).toLocaleString("en-PK");

const state = {
  overrides:   new Map(),   // dish_slug → override row
  filter:      "",
  onlySoldOut: false,
  realtime:    null,
  saveCount:   0,
  editingSlug: null,
};

/* ------------------------------------------------------------------ */
/*  STARTUP                                                           */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  const loginBtn = document.getElementById("loginBtn");
  const loginForm = document.getElementById("loginForm");
  if (loginBtn) loginBtn.addEventListener("click", onSignIn);
  if (loginForm) loginForm.addEventListener("submit", onSignIn);
  ["email","password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); onSignIn(e); }
    });
  });
  document.getElementById("signOut").addEventListener("click", () => window.db.auth.signOut());
  document.getElementById("editClose").addEventListener("click", closeEdit);
  document.getElementById("editForm").addEventListener("submit", onEditSave);
  document.getElementById("editClear").addEventListener("click", onEditClear);
  document.getElementById("menuSearch").addEventListener("input", e => {
    state.filter = e.target.value.toLowerCase();
    renderMenu();
  });
  document.getElementById("filterSoldOut").addEventListener("change", e => {
    state.onlySoldOut = e.target.checked;
    renderMenu();
  });
  document.getElementById("resetAll").addEventListener("click", onResetAll);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeEdit();
  });

  const { data: { session } } = await window.db.auth.getSession();
  if (session) enterApp(session);
  else showAuth();

  window.db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) enterApp(session);
    if (event === "SIGNED_OUT")           showAuth();
  });
});

async function onSignIn(e){
  if (e && e.preventDefault) e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("authErr");
  errEl.hidden = true;
  if (!email || !password){
    errEl.textContent = "Enter email + password.";
    errEl.hidden = false;
    return;
  }
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "SIGNING IN…";
  try {
    if (!window.db) throw new Error("Supabase client not loaded. Reload the page.");
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error("Signed in but no session returned. Check API key permissions.");
    await enterApp(data.session);
  } catch (err){
    console.error("[admin/menu] sign-in failed:", err);
    errEl.textContent = (err && err.message) ? err.message : "Couldn't sign in.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function showAuth(){
  document.getElementById("authScreen").hidden = false;
  document.getElementById("appScreen").hidden = true;
}

async function enterApp(session){
  try {
    console.log("[admin/menu] enterApp called for", session?.user?.email);
    document.getElementById("authScreen").hidden = true;
    document.getElementById("appScreen").hidden = false;
    document.getElementById("whoami").textContent = session.user.email;

    await loadOverrides().catch(err => {
      console.error("[admin/menu] loadOverrides failed:", err);
      toast("Couldn't load overrides: " + (err.message || err));
    });
    renderMenu();
    try { subscribeRealtime(); }
    catch(err){ console.error("[admin/menu] subscribeRealtime failed:", err); }
  } catch (err){
    console.error("[admin/menu] enterApp blew up:", err);
    const errEl = document.getElementById("authErr");
    if (errEl){
      errEl.textContent = "Signed in but page failed to load: " + (err.message || err);
      errEl.hidden = false;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  DATA                                                              */
/* ------------------------------------------------------------------ */
async function loadOverrides(){
  const { data, error } = await window.db.from("menu_overrides").select("*");
  if (error){ toast("Couldn't load overrides: " + error.message); return; }
  state.overrides.clear();
  (data || []).forEach(r => state.overrides.set(r.dish_slug, r));
}

function subscribeRealtime(){
  if (state.realtime) try { state.realtime.unsubscribe(); } catch(e){}
  state.realtime = window.db
    .channel("menu-overrides-admin")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "menu_overrides" },
        payload => {
          if (payload.eventType === "DELETE"){
            state.overrides.delete(payload.old.dish_slug);
          } else {
            state.overrides.set(payload.new.dish_slug, payload.new);
          }
          renderMenu();
        })
    .subscribe();
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
function renderMenu(){
  const root = document.getElementById("menuMgmt");
  root.innerHTML = "";

  MENU_DATA.forEach(cat => {
    const matching = cat.items.filter(d => matchesFilter(d, cat));
    if (!matching.length) return;

    const sec = document.createElement("section");
    sec.className = "mm-cat";
    sec.innerHTML = `
      <header class="mm-cat-head">
        <h2><span class="em">${cat.emoji||""}</span> ${cat.name}</h2>
        <span class="mm-cat-count">${matching.length} dish${matching.length===1?"":"es"}</span>
      </header>
      <div class="mm-grid"></div>
    `;
    const grid = sec.querySelector(".mm-grid");
    matching.forEach(d => grid.appendChild(dishRow(d, cat)));
    root.appendChild(sec);
  });

  if (!root.children.length){
    root.innerHTML = `<p class="mm-empty">No dishes match your filter.</p>`;
  }
}

function matchesFilter(dish, cat){
  const slug = slugifyDish(dish.name);
  const o = state.overrides.get(slug);
  if (state.onlySoldOut && (o?.is_available !== false)) return false;
  if (state.filter){
    const haystack = (dish.name + " " + (dish.desc||"") + " " + cat.name).toLowerCase();
    if (!haystack.includes(state.filter)) return false;
  }
  return true;
}

function dishRow(dish, cat){
  const slug = slugifyDish(dish.name);
  const o    = state.overrides.get(slug);
  const available = o ? o.is_available !== false : true;
  const price     = o?.price_override     != null ? Number(o.price_override)     : dish.price;
  const priceFull = o?.price_full_override!= null ? Number(o.price_full_override) : dish.priceFull;
  const desc      = o?.description_override || dish.desc;
  const pcs       = o?.pcs_override         || dish.pcs;

  const overrideTags = [];
  if (o?.price_override     != null) overrideTags.push("PRICE");
  if (o?.price_full_override!= null) overrideTags.push("FULL PRICE");
  if (o?.description_override)       overrideTags.push("DESC");
  if (o?.pcs_override)               overrideTags.push("PORTION");

  const row = document.createElement("article");
  row.className = "mm-row" + (available ? "" : " is-sold-out");
  row.dataset.slug = slug;
  row.innerHTML = `
    <div class="mm-img"></div>
    <div class="mm-main">
      <div class="mm-name">
        <h3>${dish.name}</h3>
        ${pcs ? `<span class="mm-pcs">${pcs}</span>` : ""}
      </div>
      <p class="mm-desc">${desc || ""}</p>
      ${overrideTags.length
        ? `<div class="mm-overrides">${overrideTags.map(t => `<span class="ovtag">${t} EDIT</span>`).join("")}</div>`
        : ""}
    </div>
    <div class="mm-price">
      <b>${fmtPKR(price)}</b>
      ${priceFull && priceFull !== price ? `<span>Full ${fmtPKR(priceFull)}</span>` : ""}
    </div>
    <div class="mm-actions">
      <label class="mm-toggle" title="${available ? "Available" : "Sold out"}">
        <input type="checkbox" ${available ? "checked" : ""} data-toggle />
        <span class="mm-toggle-track"></span>
        <span class="mm-toggle-label">${available ? "ON" : "OFF"}</span>
      </label>
      <button class="btn-ghost small mm-edit" data-edit>EDIT</button>
    </div>
  `;

  const img = getDishImage(dish.name, cat.id);
  const imgEl = row.querySelector(".mm-img");
  imgEl.style.backgroundImage = `url("${img}")`;
  const probe = new Image();
  probe.src = img;
  probe.onerror = () => {
    imgEl.style.backgroundImage = `url("../${window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp"}")`;
  };

  row.querySelector("[data-toggle]").addEventListener("change", e =>
    toggleAvailable(slug, dish.name, e.target.checked));
  row.querySelector("[data-edit]").addEventListener("click", () =>
    openEdit(dish, cat));
  return row;
}

/* ------------------------------------------------------------------ */
/*  ACTIONS                                                           */
/* ------------------------------------------------------------------ */
async function toggleAvailable(slug, name, isOn){
  // optimistic
  const prev = state.overrides.get(slug);
  state.overrides.set(slug, {
    ...(prev || {}),
    dish_slug: slug, dish_name: name,
    is_available: isOn,
  });
  renderMenu();

  const { error } = await window.db.from("menu_overrides").upsert({
    dish_slug:    slug,
    dish_name:    name,
    is_available: isOn,
  }, { onConflict: "dish_slug" });

  if (error){
    if (prev) state.overrides.set(slug, prev); else state.overrides.delete(slug);
    renderMenu();
    toast("Save failed: " + error.message);
    return;
  }
  bumpSaveCount();
  toast(`✓ ${name} · ${isOn ? "AVAILABLE" : "SOLD OUT"}`);
}

function openEdit(dish, cat){
  const slug = slugifyDish(dish.name);
  const o = state.overrides.get(slug);
  state.editingSlug = slug;
  state.editingDish = dish;
  state.editingCat  = cat;

  document.getElementById("editName").textContent = dish.name;
  document.getElementById("editCat").textContent  = cat.name;
  document.getElementById("editAvailable").checked = o ? o.is_available !== false : true;
  document.getElementById("editPrice").value     = o?.price_override     != null ? o.price_override     : "";
  document.getElementById("editPriceFull").value = o?.price_full_override!= null ? o.price_full_override : "";
  document.getElementById("editPcs").value       = o?.pcs_override         || "";
  document.getElementById("editDesc").value      = o?.description_override || "";

  document.getElementById("editPriceDefault").textContent     = `Default: ${fmtPKR(dish.price)} — leave empty to use default`;
  document.getElementById("editPriceFullDefault").textContent =
    dish.priceFull ? `Default: ${fmtPKR(dish.priceFull)} — leave empty for default` : `No full-size price by default`;
  document.getElementById("editPcsDefault").textContent       = dish.pcs ? `Default: "${dish.pcs}" — leave empty for default` : "No portion label by default";
  document.getElementById("editDescDefault").textContent      = `Default: "${(dish.desc||"").slice(0,90)}…" — leave empty for default`;

  document.getElementById("editModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEdit(){
  document.getElementById("editModal").hidden = true;
  document.body.style.overflow = "";
  state.editingSlug = null;
}

async function onEditSave(e){
  e.preventDefault();
  const slug = state.editingSlug;
  if (!slug) return;
  const dish = state.editingDish;
  const isAvailable = document.getElementById("editAvailable").checked;
  const price     = document.getElementById("editPrice").value.trim();
  const priceFull = document.getElementById("editPriceFull").value.trim();
  const pcs       = document.getElementById("editPcs").value.trim();
  const desc      = document.getElementById("editDesc").value.trim();

  const row = {
    dish_slug:            slug,
    dish_name:            dish.name,
    is_available:         isAvailable,
    price_override:       price     === "" ? null : Number(price),
    price_full_override:  priceFull === "" ? null : Number(priceFull),
    pcs_override:         pcs       === "" ? null : pcs,
    description_override: desc      === "" ? null : desc,
  };

  const { error } = await window.db.from("menu_overrides")
    .upsert(row, { onConflict: "dish_slug" });
  if (error){ toast("Save failed: " + error.message); return; }

  state.overrides.set(slug, row);
  bumpSaveCount();
  toast("✓ " + dish.name + " UPDATED");
  closeEdit();
  renderMenu();
}

async function onEditClear(){
  const slug = state.editingSlug;
  if (!slug) return;
  const dish = state.editingDish;
  // delete the entire override row
  const { error } = await window.db.from("menu_overrides").delete().eq("dish_slug", slug);
  if (error){ toast("Couldn't reset: " + error.message); return; }
  state.overrides.delete(slug);
  bumpSaveCount();
  toast("↺ " + dish.name + " RESET TO DEFAULT");
  closeEdit();
  renderMenu();
}

async function onResetAll(){
  if (!confirm("Reset EVERY dish back to default availability and pricing? This deletes all override rows."))
    return;
  const { error } = await window.db.from("menu_overrides").delete().neq("dish_slug", "");
  if (error){ toast("Reset failed: " + error.message); return; }
  state.overrides.clear();
  toast("↺ ALL OVERRIDES CLEARED");
  bumpSaveCount();
  renderMenu();
}

function bumpSaveCount(){
  state.saveCount += 1;
  document.getElementById("changesCount").textContent =
    state.saveCount + " change" + (state.saveCount === 1 ? "" : "s") + " saved";
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
  _toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}
