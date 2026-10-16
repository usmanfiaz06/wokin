/* =====================================================================
   WOK!N  ·  ADMIN · COMBO DEALS  ·  combos.js
   ---------------------------------------------------------------------
   Manage the bundle offers shown in the "Combo Deals" section of the
   customer menu. Add / edit / activate / delete. Photos are compressed
   in-browser before upload (same as the menu photos).
   Table: public.combos
   ===================================================================== */

const fmtPKR = n => "Rs. " + Math.round(Number(n)||0).toLocaleString("en-PK");

const state = { combos: [], editingId: null, chips: [], choices: [] };
let ALL_DISHES = [];   // flat list of menu dish names for the picker
let MENU_CATS  = [];   // [{id,name}] for the choice-category picker
let _pendingImage = null;    // File selected but not yet uploaded
let _removeImage  = false;   // true if the edit cleared the existing photo

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
  document.getElementById("comboForm").addEventListener("submit", onSaveCombo);
  document.getElementById("cbCancel").addEventListener("click", resetForm);
  document.getElementById("cbImgPick").addEventListener("click", () => document.getElementById("cbImgFile").click());
  document.getElementById("cbImgPreview").addEventListener("click", () => document.getElementById("cbImgFile").click());
  document.getElementById("cbImgFile").addEventListener("change", onPickImage);
  document.getElementById("cbImgClear").addEventListener("click", onRemoveImage);

  // dish picker for "what's included"
  if (typeof MENU_DATA !== "undefined"){
    ALL_DISHES = MENU_DATA.flatMap(c => c.items.map(d => d.name));
    MENU_CATS  = MENU_DATA.map(c => ({ id: c.id, name: c.name, emoji: c.emoji || "" }));
  }
  // choice-category picker
  const catSel = document.getElementById("cbChoiceCat");
  if (catSel){
    catSel.innerHTML = MENU_CATS.map(c => `<option value="${c.id}">${c.emoji ? c.emoji + " " : ""}${c.name}</option>`).join("");
  }
  const chAdd = document.getElementById("cbChoiceAdd");
  if (chAdd) chAdd.addEventListener("click", addChoice);
  const chLbl = document.getElementById("cbChoiceLabel");
  if (chLbl) chLbl.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); addChoice(); } });
  const di = document.getElementById("cbDishInput");
  di.addEventListener("input", () => renderDishDropdown(di.value));
  di.addEventListener("focus", () => renderDishDropdown(di.value));
  di.addEventListener("keydown", e => {
    if (e.key === "Enter"){ e.preventDefault(); if (di.value.trim()){ addChip(di.value.trim()); } }
    if (e.key === "Escape"){ hideDropdown(); }
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".cb-picker-input")) hideDropdown();
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
  } catch (err){ errEl.textContent = err.message || "Couldn't sign in."; errEl.hidden = false; }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  await loadCombos();
  renderCombos();
}

/* ---- image helpers (compress before upload) ---- */
function publicImageUrl(path){
  if (!path) return null;
  return `${(window.SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1/object/public/dish-images/${path}`;
}
async function compressImage(file, maxDim = 900, quality = 0.72){
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
}
async function uploadImageFile(file){
  let toUpload = file, ext = (file.name.split(".").pop() || "jpg").toLowerCase(), ctype = file.type || "image/jpeg";
  try { const blob = await compressImage(file); if (blob && blob.size < file.size){ toUpload = blob; ext = "jpg"; ctype = "image/jpeg"; } } catch(e){}
  const path = `combo-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await window.db.storage.from("dish-images").upload(path, toUpload, { cacheControl: "31536000", upsert: false, contentType: ctype });
  if (error) throw error;
  return path;
}
function onPickImage(e){
  const file = e.target.files?.[0]; if (!file) return;
  if (file.size > 12 * 1024 * 1024){ toast("Image is over 12 MB — pick a smaller one"); e.target.value = ""; return; }
  _pendingImage = file; _removeImage = false;
  const r = new FileReader();
  r.onload = () => { setPreview(r.result); document.getElementById("cbImgClear").hidden = false; };
  r.readAsDataURL(file);
}
function onRemoveImage(){
  _pendingImage = null; _removeImage = true;
  setPreview(null); document.getElementById("cbImgClear").hidden = true;
  document.getElementById("cbImgFile").value = "";
}
function setPreview(url){
  const prev = document.getElementById("cbImgPreview");
  if (url){ prev.innerHTML = ""; prev.style.backgroundImage = `url("${url}")`; }
  else { prev.style.backgroundImage = ""; prev.innerHTML = `<span class="img-empty">📷  Tap to upload</span>`; }
}

/* ---- data ---- */
async function loadCombos(){
  const { data, error } = await window.db.from("combos")
    .select("*").order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error){
    toast(/combos/i.test(error.message || "") ? "Run the combos DB migration first" : "Couldn't load combos: " + error.message);
    state.combos = []; return;
  }
  state.combos = data || [];
}

function renderCombos(){
  const list = document.getElementById("cbList");
  list.innerHTML = "";
  if (!state.combos.length){
    list.innerHTML = `<div class="cb-empty">No combos yet — add one above. Active combos appear in the “Combo Deals” section on the menu.</div>`;
    return;
  }
  state.combos.forEach(c => {
    const row = document.createElement("article");
    row.className = "cb-row" + (c.is_active ? "" : " is-off");
    const img = document.createElement("div"); img.className = "cb-img";
    img.style.backgroundImage = `url("${publicImageUrl(c.image_path) || "/" + (window.FALLBACK_DISH_IMG || "Assorted_Chinese_food_set.jpg.webp")}")`;
    const main = document.createElement("div"); main.className = "cb-main";
    const nm = document.createElement("b"); nm.textContent = c.name;
    // summary: fixed items + "Choose: …" for each choice
    const items = Array.isArray(c.items) && c.items.length
      ? c.items
      : (c.description || "").split(" · ").map(s => s.trim()).filter(Boolean);
    const summary = items.map(it => (it && typeof it === "object" && it.pick) ? ("Choose: " + (it.label || catName(it.pick))) : String(it)).join(" · ");
    const ds = document.createElement("p"); ds.textContent = summary;
    main.appendChild(nm); if (summary) main.appendChild(ds);
    const tag = document.createElement("span"); tag.className = "cb-tag " + (c.deli_eligible ? "is-deli" : "is-dinein");
    tag.textContent = c.deli_eligible ? "🛵 Delivery OK" : "🍽️ Dine-in & pick-up only";
    main.appendChild(tag);
    const price = document.createElement("div"); price.className = "cb-price"; price.textContent = fmtPKR(c.price);

    const actions = document.createElement("div"); actions.className = "cb-actions";
    const status = document.createElement("span"); status.className = "bn-status" + (c.is_active ? " is-live" : "");
    status.textContent = c.is_active ? "● LIVE" : "○ HIDDEN"; actions.appendChild(status);
    const toggle = document.createElement("button"); toggle.className = "btn-ghost small";
    toggle.textContent = c.is_active ? "TURN OFF" : "TURN ON";
    toggle.addEventListener("click", () => setActive(c.id, !c.is_active)); actions.appendChild(toggle);
    const edit = document.createElement("button"); edit.className = "btn-ghost small"; edit.textContent = "EDIT";
    edit.addEventListener("click", () => startEdit(c)); actions.appendChild(edit);
    const del = document.createElement("button"); del.className = "btn-ghost small cb-del"; del.textContent = "🗑";
    del.title = "Delete combo"; del.addEventListener("click", () => deleteCombo(c.id, c.name)); actions.appendChild(del);

    row.appendChild(img); row.appendChild(main); row.appendChild(price); row.appendChild(actions);
    list.appendChild(row);
  });
}

/* ---- dish picker for "what's included" ---- */
function renderDishDropdown(q){
  const dd = document.getElementById("cbDishDropdown");
  const term = (q || "").trim().toLowerCase();
  const chosen = new Set(state.chips.map(s => s.toLowerCase()));
  let matches = ALL_DISHES.filter(n => !chosen.has(n.toLowerCase()));
  if (term) matches = matches.filter(n => n.toLowerCase().includes(term));
  matches = matches.slice(0, 8);
  dd.innerHTML = "";
  if (!matches.length){ dd.hidden = true; return; }
  matches.forEach(n => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "cb-dd-item"; b.textContent = n;
    b.addEventListener("click", () => addChip(n));
    dd.appendChild(b);
  });
  dd.hidden = false;
}
function hideDropdown(){ const dd = document.getElementById("cbDishDropdown"); dd.hidden = true; dd.innerHTML = ""; }
function addChip(name){
  name = name.trim(); if (!name) return;
  if (!state.chips.some(s => s.toLowerCase() === name.toLowerCase())) state.chips.push(name);
  const di = document.getElementById("cbDishInput"); di.value = "";
  hideDropdown(); renderChips(); di.focus();
}
function removeChip(name){ state.chips = state.chips.filter(s => s !== name); renderChips(); }

/* ---- customer choices ( {pick:catId, label} ) ---- */
function catName(id){ const c = MENU_CATS.find(x => x.id === id); return c ? c.name : id; }
function addChoice(){
  const catSel = document.getElementById("cbChoiceCat");
  const lblEl  = document.getElementById("cbChoiceLabel");
  const pick = catSel ? catSel.value : "";
  const label = (lblEl ? lblEl.value : "").trim() || ("Choose your " + catName(pick).toLowerCase());
  if (!pick){ toast("Pick a category for the choice."); return; }
  state.choices.push({ pick, label });
  if (lblEl) lblEl.value = "";
  renderChoices();
}
function removeChoice(i){ state.choices.splice(i, 1); renderChoices(); }
function renderChoices(){
  const box = document.getElementById("cbChoices");
  if (!box) return;
  box.innerHTML = "";
  if (!state.choices.length){ box.hidden = true; return; }
  box.hidden = false;
  state.choices.forEach((ch, i) => {
    const row = document.createElement("div"); row.className = "cb-choice-row";
    const txt = document.createElement("span");
    txt.innerHTML = `<b>${ch.label}</b> <small>— from ${catName(ch.pick)}</small>`;
    const x = document.createElement("button"); x.type = "button"; x.className = "cb-chip-x"; x.textContent = "×";
    x.setAttribute("aria-label", "Remove choice");
    x.addEventListener("click", () => removeChoice(i));
    row.appendChild(txt); row.appendChild(x);
    box.appendChild(row);
  });
}
function renderChips(){
  const box = document.getElementById("cbChips");
  box.innerHTML = "";
  state.chips.forEach(name => {
    const chip = document.createElement("span"); chip.className = "cb-chip";
    const lbl = document.createElement("span"); lbl.textContent = name; chip.appendChild(lbl);
    const x = document.createElement("button"); x.type = "button"; x.className = "cb-chip-x";
    x.setAttribute("aria-label", "Remove"); x.textContent = "×";
    x.addEventListener("click", () => removeChip(name)); chip.appendChild(x);
    box.appendChild(chip);
  });
}

/* ---- form (add / edit) ---- */
function resetForm(){
  state.editingId = null; _pendingImage = null; _removeImage = false;
  state.chips = []; renderChips();
  state.choices = []; renderChoices(); hideDropdown();
  document.getElementById("comboForm").reset();
  const di = document.getElementById("cbDineinOnly"); if (di) di.checked = true;   // default: dine-in/pick-up only
  setPreview(null);
  document.getElementById("cbImgClear").hidden = true;
  document.getElementById("cbFormTitle").textContent = "Add a combo";
  document.getElementById("cbSave").textContent = "+ ADD COMBO";
  document.getElementById("cbCancel").hidden = true;
}
function startEdit(c){
  state.editingId = c.id; _pendingImage = null; _removeImage = false;
  document.getElementById("cbName").value = c.name;
  // split stored items into fixed (strings) and choices (objects); fall back to description
  const items = Array.isArray(c.items) && c.items.length
    ? c.items
    : (c.description || "").split(" · ").map(s => s.trim()).filter(Boolean);
  state.chips   = items.filter(it => !(it && typeof it === "object" && it.pick)).map(String);
  state.choices = items.filter(it => it && typeof it === "object" && it.pick).map(it => ({ pick: it.pick, label: it.label || "" }));
  renderChips(); renderChoices();
  document.getElementById("cbPrice").value = c.price;
  const di = document.getElementById("cbDineinOnly"); if (di) di.checked = c.deli_eligible !== true;
  setPreview(publicImageUrl(c.image_path));
  document.getElementById("cbImgClear").hidden = !c.image_path;
  document.getElementById("cbFormTitle").textContent = "Edit combo";
  document.getElementById("cbSave").textContent = "✓ SAVE CHANGES";
  document.getElementById("cbCancel").hidden = false;
  document.getElementById("comboForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function onSaveCombo(e){
  e.preventDefault();
  const name  = document.getElementById("cbName").value.trim();
  const desc  = state.chips.join(" · ");
  const price = document.getElementById("cbPrice").value.trim();
  if (!name){ toast("Give the combo a name."); return; }
  if (price === "" || Number(price) <= 0){ toast("Set a combo price."); return; }

  // structured items: fixed strings first, then the customer choices
  const items = [...state.chips.map(String), ...state.choices.map(ch => ({ pick: ch.pick, label: ch.label }))];
  const dineinOnly = !!document.getElementById("cbDineinOnly")?.checked;

  const editing = state.combos.find(c => c.id === state.editingId);
  let image_path;
  if (_pendingImage){
    try { image_path = await uploadImageFile(_pendingImage); }
    catch(err){ toast("Image upload failed: " + err.message); return; }
  } else if (_removeImage){ image_path = null; }
  else { image_path = editing ? (editing.image_path ?? null) : null; }

  const row = { name, description: desc || null, price: Number(price), image_path, items, deli_eligible: !dineinOnly };

  if (state.editingId){
    const { error } = await window.db.from("combos").update(row).eq("id", state.editingId);
    if (error){ toast("Save failed: " + error.message); return; }
    state.combos = state.combos.map(c => c.id === state.editingId ? { ...c, ...row } : c);
    toast("✓ Combo updated");
  } else {
    row.is_active = true;
    row.position = state.combos.length ? Math.max(...state.combos.map(c => c.position || 0)) + 1 : 0;
    const { data, error } = await window.db.from("combos").insert(row).select().single();
    if (error){ toast(/combos/i.test(error.message||"") ? "Run the combos DB migration first" : "Couldn't add: " + error.message); return; }
    state.combos.push(data);
    toast("🍱 Combo added");
  }
  resetForm();
  renderCombos();
}

async function setActive(id, on){
  const prev = state.combos.find(c => c.id === id);
  state.combos = state.combos.map(c => c.id === id ? { ...c, is_active: on } : c);
  renderCombos();
  const { error } = await window.db.from("combos").update({ is_active: on }).eq("id", id);
  if (error){
    if (prev) state.combos = state.combos.map(c => c.id === id ? prev : c);
    renderCombos(); toast("Save failed: " + error.message); return;
  }
  toast(on ? "✓ Combo is now live" : "✓ Combo hidden");
}

async function deleteCombo(id, name){
  if (!confirm(`Delete combo "${name}"?`)) return;
  const { error } = await window.db.from("combos").delete().eq("id", id);
  if (error){ toast("Delete failed: " + error.message); return; }
  state.combos = state.combos.filter(c => c.id !== id);
  if (state.editingId === id) resetForm();
  renderCombos();
  toast("🗑 Combo deleted");
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
