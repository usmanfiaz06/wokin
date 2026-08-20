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
  customs:     [],          // custom_dishes rows
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
  // edit-modal image controls
  document.getElementById("edImgPick").addEventListener("click", () =>
    document.getElementById("edImgFile").click());
  document.getElementById("edImgPreview").addEventListener("click", () =>
    document.getElementById("edImgFile").click());
  document.getElementById("edImgFile").addEventListener("change", onPickEditImage);
  document.getElementById("edImgClear").addEventListener("click", onRemoveEditImage);
  document.getElementById("menuSearch").addEventListener("input", e => {
    state.filter = e.target.value.toLowerCase();
    renderMenu();
  });
  document.getElementById("filterSoldOut").addEventListener("change", e => {
    state.onlySoldOut = e.target.checked;
    renderMenu();
  });
  document.getElementById("resetAll").addEventListener("click", onResetAll);
  document.getElementById("addDishBtn").addEventListener("click", openNewDishModal);
  document.getElementById("newDishClose").addEventListener("click", closeNewDishModal);
  document.getElementById("newDishCancel").addEventListener("click", closeNewDishModal);
  document.getElementById("newDishForm").addEventListener("submit", onAddDish);
  // image upload UI
  document.getElementById("ndImgPick").addEventListener("click", () =>
    document.getElementById("ndImgFile").click());
  document.getElementById("ndImgFile").addEventListener("change", onPickImage);
  document.getElementById("ndImgClear").addEventListener("click", clearImage);
  document.getElementById("ndImgPreview").addEventListener("click", () =>
    document.getElementById("ndImgFile").click());
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeEdit(); closeNewDishModal(); }
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
    await loadCustomDishes().catch(err => {
      console.warn("[admin/menu] loadCustomDishes failed (custom_dishes table missing?):", err);
    });
    populateCategoryDropdown();
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

async function loadCustomDishes(){
  const { data, error } = await window.db
    .from("custom_dishes").select("*").order("position", { ascending: true });
  if (error) throw error;
  state.customs = data || [];
}

function populateCategoryDropdown(){
  const sel = document.getElementById("ndCategory");
  if (!sel) return;
  sel.innerHTML = MENU_DATA
    .map(c => `<option value="${c.id}">${c.emoji||""} ${c.name}</option>`).join("");
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
    .on("postgres_changes",
        { event: "*", schema: "public", table: "custom_dishes" },
        payload => {
          if (payload.eventType === "DELETE"){
            state.customs = state.customs.filter(d => d.id !== payload.old.id);
          } else if (payload.eventType === "INSERT"){
            state.customs.push(payload.new);
          } else {
            state.customs = state.customs.map(d =>
              d.id === payload.new.id ? payload.new : d);
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
    const customForCat = state.customs.filter(d => d.category_id === cat.id);
    const matchingStatic = cat.items.filter(d => matchesFilter(d, cat));
    const matchingCustom = customForCat.filter(d => matchesCustom(d, cat));
    const total = matchingStatic.length + matchingCustom.length;
    if (!total) return;

    const sec = document.createElement("section");
    sec.className = "mm-cat";
    sec.innerHTML = `
      <header class="mm-cat-head">
        <h2><span class="em">${cat.emoji||""}</span> ${cat.name}</h2>
        <span class="mm-cat-count">${total} dish${total===1?"":"es"}</span>
      </header>
      <div class="mm-grid"></div>
    `;
    const grid = sec.querySelector(".mm-grid");
    matchingStatic.forEach(d => grid.appendChild(dishRow(d, cat)));
    matchingCustom.forEach(d => grid.appendChild(customDishRow(d, cat)));
    root.appendChild(sec);
  });

  if (!root.children.length){
    root.innerHTML = `<p class="mm-empty">No dishes match your filter.</p>`;
  }
}

function matchesCustom(d, cat){
  if (state.onlySoldOut && d.is_available !== false) return false;
  if (state.filter){
    const hay = (d.name + " " + (d.description||"") + " " + cat.name).toLowerCase();
    if (!hay.includes(state.filter)) return false;
  }
  return true;
}

function customDishRow(d, cat){
  const row = document.createElement("article");
  row.className = "mm-row is-custom" + (d.is_available === false ? " is-sold-out" : "");
  row.dataset.customId = d.id;
  row.innerHTML = `
    <div class="mm-img"></div>
    <div class="mm-main">
      <div class="mm-name">
        <h3>${d.name}<span class="custom-badge">CUSTOM</span></h3>
        ${d.pcs ? `<span class="mm-pcs">${d.pcs}</span>` : ""}
      </div>
      <p class="mm-desc">${d.description || ""}</p>
    </div>
    <div class="mm-price">
      <b>${fmtPKR(d.price)}</b>
      ${d.price_full && Number(d.price_full) !== Number(d.price) ? `<span>Full ${fmtPKR(d.price_full)}</span>` : ""}
    </div>
    <div class="mm-actions">
      <label class="mm-toggle">
        <input type="checkbox" ${d.is_available !== false ? "checked" : ""} data-toggle />
        <span class="mm-toggle-track"></span>
        <span class="mm-toggle-label">${d.is_available !== false ? "ON" : "OFF"}</span>
      </label>
      <button class="delete-btn" title="Delete dish" aria-label="Delete dish">🗑</button>
    </div>
  `;
  const imgEl = row.querySelector(".mm-img");
  bgImageWithFallback(imgEl, d.image_path, `/${window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp"}`);
  row.querySelector("[data-toggle]").addEventListener("change", e =>
    toggleCustomAvailable(d.id, d.name, e.target.checked));
  row.querySelector(".delete-btn").addEventListener("click", () =>
    deleteCustomDish(d.id, d.name));
  return row;
}

async function toggleCustomAvailable(id, name, isOn){
  const prev = state.customs.find(d => d.id === id);
  state.customs = state.customs.map(d => d.id === id ? { ...d, is_available: isOn } : d);
  renderMenu();
  const { error } = await window.db.from("custom_dishes")
    .update({ is_available: isOn }).eq("id", id);
  if (error){
    if (prev) state.customs = state.customs.map(d => d.id === id ? prev : d);
    renderMenu();
    toast("Save failed: " + error.message);
    return;
  }
  bumpSaveCount();
  toast(`✓ ${name} · ${isOn ? "AVAILABLE" : "SOLD OUT"}`);
}

async function deleteCustomDish(id, name){
  if (!confirm(`Delete "${name}" from the menu permanently?`)) return;
  const { error } = await window.db.from("custom_dishes").delete().eq("id", id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.customs = state.customs.filter(d => d.id !== id);
  bumpSaveCount();
  toast(`🗑 ${name} REMOVED`);
  renderMenu();
}

let _pendingImageFile = null;       // selected but not yet uploaded
let _pendingImagePath = null;       // uploaded path on Supabase Storage

function openNewDishModal(){
  document.getElementById("newDishForm").reset();
  document.getElementById("ndErr").hidden = true;
  clearImage();
  document.getElementById("newDishModal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeNewDishModal(){
  document.getElementById("newDishModal").hidden = true;
  document.body.style.overflow = "";
  clearImage();
}

function onPickImage(e){
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024){
    toast("Image is over 12 MB — please pick a smaller one");
    e.target.value = "";
    return;
  }
  _pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    const prev = document.getElementById("ndImgPreview");
    prev.innerHTML = "";
    prev.style.backgroundImage = `url("${reader.result}")`;
    document.getElementById("ndImgClear").hidden = false;
  };
  reader.readAsDataURL(file);
}

function clearImage(){
  _pendingImageFile = null;
  _pendingImagePath = null;
  const prev = document.getElementById("ndImgPreview");
  if (prev){
    prev.style.backgroundImage = "";
    prev.innerHTML = `<span class="img-empty">📷  Tap to upload</span>`;
  }
  const fi = document.getElementById("ndImgFile");
  if (fi) fi.value = "";
  const clr = document.getElementById("ndImgClear");
  if (clr) clr.hidden = true;
}

// Downscale + re-encode an image in the browser before upload, so we don't
// waste Supabase storage/egress on multi-MB photos. Returns a JPEG Blob.
async function compressImage(file, maxDim = 900, quality = 0.72){
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
  });
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));   // only ever downscale
  width  = Math.max(1, Math.round(width  * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
}

async function uploadImageFile(file){
  let toUpload = file;
  let ext   = (file.name.split(".").pop() || "jpg").toLowerCase();
  let ctype = file.type || "image/jpeg";
  try {
    const blob = await compressImage(file);
    if (blob && blob.size < file.size){ toUpload = blob; ext = "jpg"; ctype = "image/jpeg"; }
  } catch(e){ /* fall back to the original file */ }
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await window.db.storage.from("dish-images")
    .upload(path, toUpload, { cacheControl: "31536000", upsert: false, contentType: ctype });
  if (error) throw error;
  return path;
}

async function uploadPendingImage(){
  if (!_pendingImageFile) return null;
  _pendingImagePath = await uploadImageFile(_pendingImageFile);
  return _pendingImagePath;
}

/* ---- edit-modal image (change an existing dish's photo) ----------- */
let _editPendingFile = null;   // a newly picked photo, not yet uploaded
let _editRemoveImage = false;  // true when the chef hit REMOVE

function onPickEditImage(e){
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024){
    toast("Image is over 12 MB — please pick a smaller one");
    e.target.value = "";
    return;
  }
  _editPendingFile = file;
  _editRemoveImage = false;
  const reader = new FileReader();
  reader.onload = () => {
    setEditPreview(reader.result);
    document.getElementById("edImgClear").hidden = false;
  };
  reader.readAsDataURL(file);
}

function onRemoveEditImage(){
  _editPendingFile = null;
  _editRemoveImage = true;
  const dish = state.editingDish, cat = state.editingCat;
  setEditPreview(dish ? getDishImage(dish.name, cat.id) : null); // back to default
  document.getElementById("edImgClear").hidden = true;
  const fi = document.getElementById("edImgFile");
  if (fi) fi.value = "";
}

function setEditPreview(url){
  const prev = document.getElementById("edImgPreview");
  if (!prev) return;
  if (url){
    prev.innerHTML = "";
    prev.style.backgroundImage = `url("${url}")`;
  } else {
    prev.style.backgroundImage = "";
    prev.innerHTML = `<span class="img-empty">📷  Tap to upload</span>`;
  }
}

function resetEditImage(){
  _editPendingFile = null;
  _editRemoveImage = false;
  const fi = document.getElementById("edImgFile");
  if (fi) fi.value = "";
}

/* Must match DISH_PHOTO_REV in order.js — see the note there. */
const DISH_PHOTO_REV = "2026-08-20.2";
function dishPhotoUrl(path){
  return path ? `/dish-uploads/${path}?v=${DISH_PHOTO_REV}` : null;
}

function publicImageUrl(path){
  if (!path) return null;
  const base = (window.SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/dish-images/${path}`;
}

// Paint a dish photo trying the cheap Vercel copy first, then Supabase,
// then a static fallback — so the admin list doesn't burn Supabase egress.
function bgImageWithFallback(el, image_path, staticFallback){
  el.style.backgroundImage = `url("${staticFallback}")`;
  if (!image_path) return;
  const cands = [dishPhotoUrl(image_path), publicImageUrl(image_path)];
  let i = 0;
  const next = () => {
    if (i >= cands.length) return;
    const u = cands[i++];
    const pr = new Image();
    pr.onload  = () => { el.style.backgroundImage = `url("${u}")`; };
    pr.onerror = next;
    pr.src = u;
  };
  next();
}

async function onAddDish(e){
  e.preventDefault();
  const errEl = document.getElementById("ndErr");
  errEl.hidden = true;
  const tags = Array.from(document.querySelectorAll("[data-tag]:checked")).map(c => c.value);

  const row = {
    category_id:   document.getElementById("ndCategory").value,
    name:          document.getElementById("ndName").value.trim(),
    description:   document.getElementById("ndDesc").value.trim() || null,
    price:         Number(document.getElementById("ndPrice").value),
    price_full:    document.getElementById("ndPriceFull").value
                     ? Number(document.getElementById("ndPriceFull").value) : null,
    pcs:           document.getElementById("ndPcs").value.trim() || null,
    tags,
    is_available:  true,
  };
  if (!row.name || !row.price || !row.category_id){
    errEl.textContent = "Pick a category, enter a name and price.";
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById("newDishSubmit");
  btn.disabled = true;
  const orig = btn.textContent;

  try {
    // upload image first (if any)
    if (_pendingImageFile){
      btn.textContent = "UPLOADING IMAGE…";
      const path = await uploadPendingImage();
      row.image_path = path;
    }
    btn.textContent = "SAVING…";
    const { data, error } = await window.db
      .from("custom_dishes").insert(row).select().single();
    if (error) throw error;
    state.customs.push(data);
    bumpSaveCount();
    toast(`★ ${row.name} ADDED TO MENU`);
    closeNewDishModal();
    renderMenu();
  } catch (err){
    console.error("[admin/menu] add dish failed:", err);
    errEl.textContent = err.message || "Save failed";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
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
  const hidden    = o ? o.is_hidden === true : false;
  const popular   = o ? o.is_popular === true : false;
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
  row.className = "mm-row" + (available ? "" : " is-sold-out") + (hidden ? " is-hidden-row" : "");
  row.dataset.slug = slug;
  row.innerHTML = `
    <div class="mm-img"></div>
    <div class="mm-main">
      <div class="mm-name">
        <h3>${dish.name}</h3>
        ${popular ? `<span class="pop-badge">★ POPULAR</span>` : ""}
        ${hidden ? `<span class="hidden-badge">HIDDEN</span>` : ""}
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
      <button class="btn-ghost small mm-pop ${popular ? "is-on" : ""}" data-pop title="${popular ? "Remove from Crowd Favourites" : "Add to Crowd Favourites"}">★</button>
      <button class="btn-ghost small mm-hide" data-hide title="${hidden ? "Show on menu" : "Hide from menu"}">${hidden ? "SHOW" : "HIDE"}</button>
      <button class="btn-ghost small mm-edit" data-edit>EDIT</button>
    </div>
  `;

  const imgEl = row.querySelector(".mm-img");
  bgImageWithFallback(imgEl, (o && o.image_path) || null,
    (o && o.image_path) ? `../${window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp"}` : getDishImage(dish.name, cat.id));

  row.querySelector("[data-toggle]").addEventListener("change", e =>
    toggleAvailable(slug, dish.name, e.target.checked));
  row.querySelector("[data-hide]").addEventListener("click", () =>
    toggleHidden(slug, dish.name, !hidden));
  row.querySelector("[data-pop]").addEventListener("click", () =>
    togglePopular(slug, dish.name, !popular));
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

// Fully hide / show a dish on the customer menu (via is_hidden override)
async function toggleHidden(slug, name, hide){
  const prev = state.overrides.get(slug);
  state.overrides.set(slug, { ...(prev || {}), dish_slug: slug, dish_name: name, is_hidden: hide });
  renderMenu();

  const row = { dish_slug: slug, dish_name: name, is_hidden: hide };
  let { error } = await window.db.from("menu_overrides").upsert(row, { onConflict: "dish_slug" });
  if (error && /is_hidden/i.test(error.message || "")){
    if (prev) state.overrides.set(slug, prev); else state.overrides.delete(slug);
    renderMenu();
    toast("Run the latest DB migration to enable Hide (is_hidden column)");
    return;
  }
  if (error){
    if (prev) state.overrides.set(slug, prev); else state.overrides.delete(slug);
    renderMenu();
    toast("Save failed: " + error.message);
    return;
  }
  bumpSaveCount();
  toast(`${hide ? "🙈 " + name + " HIDDEN" : "👁 " + name + " SHOWN"}`);
}

// Add / remove a dish from the Crowd Favourites (popular) row
async function togglePopular(slug, name, on){
  const prev = state.overrides.get(slug);
  state.overrides.set(slug, { ...(prev || {}), dish_slug: slug, dish_name: name, is_popular: on });
  renderMenu();

  const row = { dish_slug: slug, dish_name: name, is_popular: on };
  let { error } = await window.db.from("menu_overrides").upsert(row, { onConflict: "dish_slug" });
  if (error){
    if (prev) state.overrides.set(slug, prev); else state.overrides.delete(slug);
    renderMenu();
    toast(/is_popular/i.test(error.message || "")
      ? "Run the latest DB migration to manage the popular row (is_popular column)"
      : "Save failed: " + error.message);
    return;
  }
  bumpSaveCount();
  toast(`${on ? "★ " + name + " ADDED to Crowd Favourites" : name + " REMOVED from Crowd Favourites"}`);
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
  document.getElementById("editHidden").checked    = o ? o.is_hidden === true : false;
  document.getElementById("editPopular").checked   = o ? o.is_popular === true : false;

  // Sizes: single / half / full (soups) · half / full · single
  const hasFull  = dish.priceFull != null;
  const is3size  = hasFull && dish.priceHalf != null;
  // In a 2-size dish, `price` IS the Half price; in a 3-size dish it's Single.
  document.getElementById("editPriceLabel").textContent = is3size ? "Single price" : (hasFull ? "Half price" : "Price");
  document.getElementById("editPriceHalfField").hidden  = !is3size;
  document.getElementById("editPriceFullField").hidden  = !hasFull;

  document.getElementById("editPrice").value     = o?.price_override      != null ? o.price_override      : (dish.price     || "");
  document.getElementById("editPriceHalf").value = o?.price_half_override != null ? o.price_half_override : (dish.priceHalf || "");
  document.getElementById("editPriceFull").value = o?.price_full_override != null ? o.price_full_override : (dish.priceFull || "");
  document.getElementById("editPcs").value       = o?.pcs_override         != null ? o.pcs_override         : (dish.pcs   || "");
  document.getElementById("editDesc").value      = o?.description_override != null ? o.description_override : (dish.desc  || "");

  document.getElementById("editPriceDefault").textContent     = `Default: ${fmtPKR(dish.price)} — leave empty to use default`;
  document.getElementById("editPriceHalfDefault").textContent = dish.priceHalf ? `Default: ${fmtPKR(dish.priceHalf)} — leave empty for default` : "";
  document.getElementById("editPriceFullDefault").textContent =
    dish.priceFull ? `Default: ${fmtPKR(dish.priceFull)} — leave empty for default` : `No full-size price by default`;
  document.getElementById("editPcsDefault").textContent       = dish.pcs ? `Default: "${dish.pcs}" — leave empty for default` : "No portion label by default";
  document.getElementById("editDescDefault").textContent      = `Default: "${(dish.desc||"").slice(0,90)}…" — leave empty for default`;

  // image: show the dish's current photo (custom override if set, else default)
  resetEditImage();
  const curImg = (o && o.image_path) ? publicImageUrl(o.image_path) : getDishImage(dish.name, cat.id);
  setEditPreview(curImg);
  document.getElementById("edImgClear").hidden = !(o && o.image_path);

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
  const isHidden    = document.getElementById("editHidden").checked;
  const isPopular   = document.getElementById("editPopular").checked;
  const price     = document.getElementById("editPrice").value.trim();
  const priceHalf = document.getElementById("editPriceHalf").value.trim();
  const priceFull = document.getElementById("editPriceFull").value.trim();
  const pcs       = document.getElementById("editPcs").value.trim();
  const desc      = document.getElementById("editDesc").value.trim();

  const o = state.overrides.get(slug);
  // Resolve the photo: new upload → keep existing → removed → default
  let imagePath;
  if (_editPendingFile){
    try { imagePath = await uploadImageFile(_editPendingFile); }
    catch(err){ toast("Image upload failed: " + err.message); return; }
  } else if (_editRemoveImage){
    imagePath = null;
  } else {
    imagePath = o?.image_path ?? null;
  }

  const row = {
    dish_slug:            slug,
    dish_name:            dish.name,
    is_available:         isAvailable,
    is_hidden:            isHidden,
    is_popular:           isPopular,
    price_override:       price     === "" ? null : Number(price),
    price_half_override:  priceHalf === "" ? null : Number(priceHalf),
    price_full_override:  priceFull === "" ? null : Number(priceFull),
    pcs_override:         pcs       === "" ? null : pcs,
    description_override: desc      === "" ? null : desc,
    image_path:           imagePath,
  };

  // Upsert, dropping any newer columns the DB doesn't have yet so edits
  // still save (and warn the admin to run the migration).
  let attempt = { ...row };
  let error, dropped = false;
  for (let i = 0; i < 3; i++){
    ({ error } = await window.db.from("menu_overrides").upsert(attempt, { onConflict: "dish_slug" }));
    if (!error) break;
    const msg = error.message || "";
    const col = ["price_half_override", "image_path", "is_hidden", "is_popular"].find(c => msg.includes(c) && c in attempt);
    if (!col) break;
    delete attempt[col]; dropped = true;
  }
  if (error){ toast("Save failed: " + error.message); return; }

  state.overrides.set(slug, attempt);
  bumpSaveCount();
  toast(dropped
    ? "Saved — run the latest DB migration for new size/photo fields"
    : "✓ " + dish.name + " UPDATED");
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
