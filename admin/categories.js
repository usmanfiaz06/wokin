/* =====================================================================
   WOK!N  ·  ADMIN · MENU CATEGORIES  ·  categories.js
   ---------------------------------------------------------------------
   Rename a category, change its emoji, reorder the menu, hide/show a
   whole section. Overrides are keyed by the stable category id from
   menu-data.js, so renaming never orphans a dish.
   Table: public.menu_categories
   ===================================================================== */

const state = { cats: [], removed: [] };   // cats:[{ id, isCustom, baseName, baseEmoji, name, emoji, hidden, position }]

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
  document.getElementById("catSave").addEventListener("click", save);
  document.getElementById("catAdd").addEventListener("click", addCategory);
  document.getElementById("catReset").addEventListener("click", async () => { await load(); render(); toast("↺ Reverted to saved"); });

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
  await load();
  render();
}

async function load(){
  state.removed = [];
  if (typeof MENU_DATA === "undefined"){ toast("Menu data didn't load."); state.cats = []; return; }
  const baseIds = {};
  const base = MENU_DATA.map((c, i) => { baseIds[c.id] = true; return { id: c.id, baseName: c.name, baseEmoji: c.emoji || "", _idx: i }; });
  let ov = {};
  try {
    const { data, error } = await window.db.from("menu_categories").select("*");
    if (error) throw error;
    (data || []).forEach(r => { if (r.cat_id) ov[r.cat_id] = r; });
  } catch(e){
    if (/menu_categories/i.test(e.message || "")) toast("Run the menu-categories DB migration first");
  }
  // built-in categories, with any saved override applied
  const builtins = base.map(b => {
    const o = ov[b.id] || {};
    return {
      id: b.id, isCustom: false, baseName: b.baseName, baseEmoji: b.baseEmoji,
      name:  (o.name  && String(o.name).trim())  ? String(o.name)  : b.baseName,
      emoji: (o.emoji && String(o.emoji).trim()) ? String(o.emoji) : b.baseEmoji,
      hidden: !!o.is_hidden,
      position: (o.position != null) ? Number(o.position) : b._idx,
    };
  });
  // admin-created categories = override rows whose id isn't a built-in
  const customs = Object.keys(ov).filter(id => !baseIds[id]).map(id => {
    const o = ov[id];
    return {
      id, isCustom: true, baseName: "", baseEmoji: "",
      name: o.name ? String(o.name) : "Untitled",
      emoji: o.emoji ? String(o.emoji) : "",
      hidden: !!o.is_hidden,
      position: (o.position != null) ? Number(o.position) : 999,
    };
  });
  state.cats = builtins.concat(customs).sort((a, b) => a.position - b.position);
}

function addCategory(){
  const id = "cat-" + Math.random().toString(16).slice(2, 8);
  state.cats.push({ id, isCustom: true, baseName: "", baseEmoji: "", name: "", emoji: "🍽️", hidden: false, position: state.cats.length });
  render();
  // focus the new name field
  const rows = document.querySelectorAll(".cat-row");
  const last = rows[rows.length - 1];
  const nm = last && last.querySelector(".cat-name");
  if (nm) nm.focus();
  toast("New category added — name it, then SAVE. Assign dishes to it from Menu → Add a fresh one.");
}

function render(){
  const wrap = document.getElementById("catList");
  wrap.innerHTML = "";
  state.cats.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "cat-row" + (c.hidden ? " is-off" : "");

    const emoji = document.createElement("input");
    emoji.className = "cat-emoji"; emoji.type = "text"; emoji.value = c.emoji; emoji.maxLength = 8; emoji.title = "Icon";
    emoji.addEventListener("input", () => { c.emoji = emoji.value; });
    row.appendChild(emoji);

    const name = document.createElement("input");
    name.className = "cat-name"; name.type = "text"; name.value = c.name; name.maxLength = 40;
    name.placeholder = c.isCustom ? "New category name…" : "";
    name.addEventListener("input", () => { c.name = name.value; });
    row.appendChild(name);

    const ctl = document.createElement("div");
    ctl.className = "cat-ctl";

    if (c.isCustom){
      const tag = document.createElement("span");
      tag.className = "cat-tag"; tag.textContent = "NEW";
      ctl.appendChild(tag);
    }

    const status = document.createElement("span");
    status.className = "bn-status" + (c.hidden ? "" : " is-live");
    status.textContent = c.hidden ? "○ HIDDEN" : "● LIVE";
    ctl.appendChild(status);

    const toggle = document.createElement("button");
    toggle.className = "btn-ghost small";
    toggle.textContent = c.hidden ? "Show" : "Hide";
    toggle.title = c.hidden ? "Hidden from customers — click to show" : "Visible — click to hide this whole section";
    toggle.addEventListener("click", () => { c.hidden = !c.hidden; render(); });
    ctl.appendChild(toggle);

    ctl.appendChild(mkBtn("▲", "Move up", i === 0, () => move(i, i-1)));
    ctl.appendChild(mkBtn("▼", "Move down", i === state.cats.length-1, () => move(i, i+1)));

    if (c.isCustom){
      const del = mkBtn("🗑", "Delete this category", false, () => removeCategory(i));
      del.classList.add("cb-del");
      ctl.appendChild(del);
    }

    row.appendChild(ctl);
    wrap.appendChild(row);
  });
}

function mkBtn(label, title, disabled, fn){
  const b = document.createElement("button");
  b.className = "btn-ghost small"; b.textContent = label; b.title = title; b.disabled = !!disabled;
  if (!disabled) b.addEventListener("click", fn);
  return b;
}

function move(a, b){
  if (b < 0 || b >= state.cats.length) return;
  const t = state.cats[a]; state.cats[a] = state.cats[b]; state.cats[b] = t;
  render();
}

function removeCategory(i){
  const c = state.cats[i];
  if (!c || !c.isCustom) return;
  if (!confirm(`Delete the "${c.name || "Untitled"}" category? Any custom dishes you put in it will no longer show. (Built-in dishes are never affected.)`)) return;
  state.removed.push(c.id);              // deleted from DB on Save
  state.cats.splice(i, 1);
  render();
}

async function save(){
  const btn = document.getElementById("catSave");
  const saved = document.getElementById("catSaved");
  // basic guard: a category must keep a name
  for (const c of state.cats){
    if (!String(c.name).trim()){ toast(c.isCustom ? "Your new category needs a name." : ("Every category needs a name (" + c.baseName + " is blank).")); return; }
  }
  const rows = state.cats.map((c, i) => ({
    cat_id: c.id,
    // built-in: store null when unchanged so future menu edits flow through.
    // custom: always store the name/emoji (there's no built-in to fall back to).
    name:  c.isCustom ? c.name.trim()  : ((c.name.trim()  && c.name.trim()  !== c.baseName)  ? c.name.trim()  : null),
    emoji: c.isCustom ? (c.emoji.trim() || null) : ((c.emoji.trim() && c.emoji.trim() !== c.baseEmoji) ? c.emoji.trim() : null),
    position: i,
    is_hidden: !!c.hidden,
    updated_at: new Date().toISOString(),
  }));
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "SAVING…"; saved.hidden = true;
  try {
    const { error } = await window.db.from("menu_categories").upsert(rows, { onConflict: "cat_id" });
    if (error) throw error;
    // process deletions of custom categories
    if (state.removed.length){
      const { error: delErr } = await window.db.from("menu_categories").delete().in("cat_id", state.removed);
      if (delErr) throw delErr;
      state.removed = [];
    }
    saved.hidden = false;
    toast("✓ Saved · live on the site");
    setTimeout(() => { saved.hidden = true; }, 4000);
  } catch(e){
    toast(/menu_categories/i.test(e.message || "") ? "Run the menu-categories DB migration first" : "Save failed: " + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* ---- toast ---- */
let _toastTimer;
function toast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
