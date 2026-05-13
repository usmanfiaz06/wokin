/* =====================================================================
   WOK!N  ·  ADMIN · COUPONS  ·  coupons.js
   ---------------------------------------------------------------------
   - List all coupons, search by code/label, filter inactive
   - "+ NEW COUPON" modal for create OR edit (form re-used)
   - Real-time: another admin's edits propagate
   - Each card shows usage (used / limit), discount, validity window
   ===================================================================== */

const fmtPKR = n => "Rs. " + Math.round(Number(n)||0).toLocaleString("en-PK");
const fmtDate = iso => iso ? new Date(iso).toLocaleString("en-PK",
  { dateStyle: "medium", timeStyle: "short" }) : "—";

const state = {
  coupons:    [],    // array of rows
  filter:     "",
  inactive:   false,
  realtime:   null,
  editingCode: null,  // null = creating new, "WOKIN10" = editing existing
};

window.addEventListener("error", e => {
  const errEl = document.getElementById("authErr");
  if (errEl){ errEl.hidden = false; errEl.textContent = "JS ERROR · " + e.message; }
});

document.addEventListener("DOMContentLoaded", async () => {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", onSignIn);
  document.getElementById("loginForm").addEventListener("submit", onSignIn);
  ["email","password"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); onSignIn(e); }
    });
  });

  document.getElementById("signOut").addEventListener("click", () => window.db.auth.signOut());
  document.getElementById("addCouponBtn").addEventListener("click", () => openModal(null));
  document.getElementById("couponClose").addEventListener("click", closeModal);
  document.getElementById("couponCancel").addEventListener("click", closeModal);
  document.getElementById("couponForm").addEventListener("submit", onSave);
  document.getElementById("cmDelete").addEventListener("click", onDelete);
  document.getElementById("cmType").addEventListener("change", refreshTypeHint);
  document.getElementById("cmValue").addEventListener("input", refreshTypeHint);
  document.getElementById("cmScope").addEventListener("change", refreshScope);
  document.getElementById("couponSearch").addEventListener("input", e => {
    state.filter = e.target.value.toLowerCase(); render();
  });
  document.getElementById("filterInactive").addEventListener("change", e => {
    state.inactive = e.target.checked; render();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
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
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "SIGNING IN…";
  try {
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error("No session returned");
    await enterApp(data.session);
  } catch (err){
    errEl.textContent = err.message || "Couldn't sign in.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function enterApp(session){
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden  = false;
  document.getElementById("whoami").textContent = session.user.email;
  populateScopeDropdowns();
  await load();
  await loadCustomDishesForScope();
  subscribe();
}

function populateScopeDropdowns(){
  // category dropdown from static MENU_DATA
  const catSel = document.getElementById("cmScopeCategory");
  catSel.innerHTML = MENU_DATA
    .map(c => `<option value="${c.id}">${c.emoji||""} ${c.name}</option>`).join("");

  // static dish dropdown — all static menu items, grouped by category
  const dsSel = document.getElementById("cmScopeDishStatic");
  dsSel.innerHTML = MENU_DATA.map(cat =>
    `<optgroup label="${cat.name}">` +
      cat.items.map(d => `<option value="${slugifyDish(d.name)}">${d.name}</option>`).join("") +
    `</optgroup>`
  ).join("");
}

let _customDishesForScope = [];
async function loadCustomDishesForScope(){
  try {
    const { data, error } = await window.db.from("custom_dishes")
      .select("id, name, category_id").order("name");
    if (error) throw error;
    _customDishesForScope = data || [];
    const sel = document.getElementById("cmScopeDishCustom");
    sel.innerHTML = _customDishesForScope.length
      ? _customDishesForScope.map(d => `<option value="${d.id}">${d.name} · ${d.category_id}</option>`).join("")
      : `<option disabled>(no custom dishes yet)</option>`;
  } catch(e){
    console.warn("custom dishes scope load failed:", e.message);
  }
}

function refreshScope(){
  const scope = document.getElementById("cmScope").value;
  document.getElementById("cmScopeCategoryWrap").hidden  = scope !== "category";
  document.getElementById("cmScopeDishStaticWrap").hidden= scope !== "dish_static";
  document.getElementById("cmScopeDishCustomWrap").hidden= scope !== "dish_custom";
}

async function load(){
  const { data, error } = await window.db
    .from("coupons").select("*").order("created_at", { ascending: false });
  if (error){
    toast("Couldn't load coupons: " + error.message);
    return;
  }
  state.coupons = data || [];
  render();
}

function subscribe(){
  if (state.realtime) try { state.realtime.unsubscribe(); } catch(e){}
  state.realtime = window.db.channel("coupons-admin")
    .on("postgres_changes",
        { event: "*", schema: "public", table: "coupons" },
        payload => {
          if (payload.eventType === "DELETE"){
            state.coupons = state.coupons.filter(c => c.code !== payload.old.code);
          } else if (payload.eventType === "INSERT"){
            if (!state.coupons.some(c => c.code === payload.new.code)){
              state.coupons.unshift(payload.new);
            }
          } else {
            state.coupons = state.coupons.map(c =>
              c.code === payload.new.code ? payload.new : c);
          }
          render();
        })
    .subscribe();
}

function refreshTypeHint(){
  const type = document.getElementById("cmType").value;
  const value = document.getElementById("cmValue").value;
  const hint = document.getElementById("cmValueHint");
  if (type === "percent") hint.textContent = (value || 10) + "% off the subtotal";
  else hint.textContent  = "Rs. " + (value || 0) + " off the subtotal";
}

function render(){
  const grid = document.getElementById("couponGrid");
  grid.innerHTML = "";
  const filtered = state.coupons.filter(c => {
    if (state.inactive && c.is_active) return false;
    if (state.filter){
      const hay = (c.code + " " + c.label + " " + (c.description||"")).toLowerCase();
      if (!hay.includes(state.filter)) return false;
    }
    return true;
  });
  document.getElementById("couponCount").textContent =
    state.coupons.length + " coupon" + (state.coupons.length === 1 ? "" : "s");

  if (!filtered.length){
    grid.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">No coupons here yet.</p>
        <p class="empty-sub">Click "+ NEW COUPON" above to create your first one.</p>
      </div>`;
    return;
  }

  filtered.forEach(c => grid.appendChild(couponCard(c)));
}

function couponCard(c){
  const card = document.createElement("article");
  card.className = "coupon-card" + (c.is_active ? "" : " is-inactive");
  const limit = c.usage_limit ? c.usage_limit : "∞";
  const pct   = c.usage_limit ? Math.min(100, (c.used_count / c.usage_limit) * 100) : 0;

  let validity = "Always valid";
  if (c.valid_from && c.valid_until)
    validity = `${fmtDate(c.valid_from)} → ${fmtDate(c.valid_until)}`;
  else if (c.valid_until)
    validity = `Until ${fmtDate(c.valid_until)}`;
  else if (c.valid_from)
    validity = `From ${fmtDate(c.valid_from)}`;

  const valueLabel = c.discount_type === "percent"
    ? `${c.discount_value}% OFF`
    : `Rs. ${c.discount_value} OFF`;

  // Scope label
  let scopeLabel = "Whole order";
  if (c.scope === "category")       scopeLabel = `Category · ${c.scope_category || "?"}`;
  if (c.scope === "dish_static")    scopeLabel = `Dish · ${c.scope_dish_slug || "?"}`;
  if (c.scope === "dish_custom") {
    const found = _customDishesForScope.find(d => d.id === c.scope_custom_dish_id);
    scopeLabel = `Custom · ${found?.name || c.scope_custom_dish_id || "?"}`;
  }

  card.innerHTML = `
    <div class="cc-head">
      <div class="cc-code-wrap">
        <span class="cc-code">${c.code}</span>
        ${c.is_active ? "" : `<span class="cc-inactive">INACTIVE</span>`}
        ${c.is_auto_apply ? `<span class="cc-auto">AUTO</span>` : ""}
      </div>
      <span class="cc-value">${valueLabel}</span>
    </div>
    <p class="cc-label">${c.label}</p>
    ${c.description ? `<p class="cc-desc">${c.description}</p>` : ""}
    <dl class="cc-grid">
      <dt>Applies to</dt><dd>${scopeLabel}</dd>
      <dt>Min order</dt><dd>${c.min_order > 0 ? fmtPKR(c.min_order) : "—"}</dd>
      <dt>Max cap</dt><dd>${c.max_discount ? fmtPKR(c.max_discount) : "—"}</dd>
      <dt>Validity</dt><dd>${validity}</dd>
    </dl>
    <div class="cc-usage">
      <span><b>${c.used_count}</b> / ${limit} used</span>
      ${c.usage_limit ? `<div class="cc-bar"><div class="cc-fill" style="width:${pct}%"></div></div>` : ""}
    </div>
    <div class="cc-actions">
      <button class="btn-ghost small" data-edit>EDIT</button>
      <label class="mm-toggle" title="${c.is_active ? "Active" : "Inactive"}">
        <input type="checkbox" ${c.is_active ? "checked" : ""} data-toggle />
        <span class="mm-toggle-track"></span>
        <span class="mm-toggle-label">${c.is_active ? "ON" : "OFF"}</span>
      </label>
    </div>
  `;
  card.querySelector("[data-edit]").addEventListener("click", () => openModal(c.code));
  card.querySelector("[data-toggle]").addEventListener("change", e => toggleActive(c.code, e.target.checked));
  return card;
}

async function toggleActive(code, isOn){
  const prev = state.coupons.find(c => c.code === code);
  state.coupons = state.coupons.map(c => c.code === code ? { ...c, is_active: isOn } : c);
  render();
  const { error } = await window.db.from("coupons").update({ is_active: isOn }).eq("code", code);
  if (error){
    if (prev) state.coupons = state.coupons.map(c => c.code === code ? prev : c);
    render();
    toast("Save failed: " + error.message);
    return;
  }
  toast(`✓ ${code} · ${isOn ? "ACTIVE" : "INACTIVE"}`);
}

function openModal(code){
  state.editingCode = code;
  const c = code ? state.coupons.find(x => x.code === code) : null;
  document.getElementById("cmEyebrow").textContent = c ? "EDIT COUPON" : "NEW COUPON";
  document.getElementById("cmTitle").innerHTML = c
    ? `Edit <em>${code}</em>.`
    : `Add a <em>coupon</em>.`;
  document.getElementById("cmCode").value         = c?.code || "";
  document.getElementById("cmCode").disabled      = !!c;        // code is PK, can't change
  document.getElementById("cmLabel").value        = c?.label || "";
  document.getElementById("cmType").value         = c?.discount_type || "percent";
  document.getElementById("cmValue").value        = c?.discount_value || "";
  document.getElementById("cmMinOrder").value     = c?.min_order || "";
  document.getElementById("cmMaxDiscount").value  = c?.max_discount || "";
  document.getElementById("cmValidFrom").value    = c?.valid_from ? c.valid_from.slice(0,16) : "";
  document.getElementById("cmValidUntil").value   = c?.valid_until ? c.valid_until.slice(0,16) : "";
  document.getElementById("cmUsageLimit").value   = c?.usage_limit || "";
  document.getElementById("cmDescription").value  = c?.description || "";
  document.getElementById("cmActive").checked     = c ? c.is_active !== false : true;
  document.getElementById("cmAutoApply").checked  = c ? !!c.is_auto_apply : false;
  document.getElementById("cmScope").value        = c?.scope || "order";
  if (c?.scope_category)        document.getElementById("cmScopeCategory").value = c.scope_category;
  if (c?.scope_dish_slug)       document.getElementById("cmScopeDishStatic").value = c.scope_dish_slug;
  if (c?.scope_custom_dish_id)  document.getElementById("cmScopeDishCustom").value = c.scope_custom_dish_id;
  document.getElementById("cmDelete").hidden      = !c;
  document.getElementById("cmErr").hidden         = true;
  refreshTypeHint();
  refreshScope();
  document.getElementById("couponModal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(){
  document.getElementById("couponModal").hidden = true;
  document.body.style.overflow = "";
  state.editingCode = null;
}

async function onSave(e){
  e.preventDefault();
  const code  = document.getElementById("cmCode").value.trim().toUpperCase();
  const label = document.getElementById("cmLabel").value.trim();
  const type  = document.getElementById("cmType").value;
  const value = Number(document.getElementById("cmValue").value);
  const minOrder = document.getElementById("cmMinOrder").value;
  const maxDisc  = document.getElementById("cmMaxDiscount").value;
  const vFrom = document.getElementById("cmValidFrom").value;
  const vUntil = document.getElementById("cmValidUntil").value;
  const limit = document.getElementById("cmUsageLimit").value;
  const desc  = document.getElementById("cmDescription").value.trim();
  const active = document.getElementById("cmActive").checked;
  const errEl = document.getElementById("cmErr");
  errEl.hidden = true;

  if (!code || !label || !value){
    errEl.textContent = "Code, label and value are required."; errEl.hidden = false; return;
  }
  if (type === "percent" && value > 100){
    errEl.textContent = "Percent value can't exceed 100."; errEl.hidden = false; return;
  }

  const scope = document.getElementById("cmScope").value;
  const row = {
    code,
    label,
    description:    desc || null,
    discount_type:  type,
    discount_value: value,
    min_order:      minOrder ? Number(minOrder) : 0,
    max_discount:   maxDisc  ? Number(maxDisc)  : null,
    valid_from:     vFrom ? new Date(vFrom).toISOString() : null,
    valid_until:    vUntil ? new Date(vUntil).toISOString() : null,
    usage_limit:    limit ? Number(limit) : null,
    is_active:      active,
    is_auto_apply:  document.getElementById("cmAutoApply").checked,
    scope,
    scope_category:       scope === "category"    ? document.getElementById("cmScopeCategory").value : null,
    scope_dish_slug:      scope === "dish_static" ? document.getElementById("cmScopeDishStatic").value : null,
    scope_custom_dish_id: scope === "dish_custom" ? document.getElementById("cmScopeDishCustom").value : null,
  };

  const btn = document.getElementById("couponSubmit");
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SAVING…";
  try {
    const { data, error } = await window.db
      .from("coupons").upsert(row, { onConflict: "code" }).select().single();
    if (error) throw error;
    toast(`✓ ${code} ${state.editingCode ? "UPDATED" : "CREATED"}`);
    closeModal();
  } catch (err){
    errEl.textContent = err.message || "Save failed";
    errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function onDelete(){
  if (!state.editingCode) return;
  if (!confirm(`Permanently delete coupon "${state.editingCode}"? This can't be undone.`)) return;
  const { error } = await window.db.from("coupons").delete().eq("code", state.editingCode);
  if (error){ toast("Delete failed: " + error.message); return; }
  toast(`🗑 ${state.editingCode} DELETED`);
  closeModal();
}

let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
