/* =====================================================================
   WOK!N  ·  QR DEALS PAGE  ·  deals.js
   ---------------------------------------------------------------------
   Flow:
     1. Guest scans the table QR  →  lands on the gate (name/mobile/email)
     2. Details are written to public.qr_leads  →  Admin → GUESTS
     3. The offers unlock. The details are remembered on the device, so a
        returning guest skips straight to the deals.

   The deals themselves are never gated behind a *successful* insert —
   if Supabase is down or the migration hasn't been run yet, the guest
   still sees the offers and the lead is queued for the next visit.
   ===================================================================== */

const LEAD_KEY    = "wokin_qr_lead";      // the saved guest on this device
const PENDING_KEY = "wokin_qr_pending";   // lead that failed to save, retried later
const SOURCE      = "qr-deals";

/* What a guest sends when they tap "Share on WhatsApp". The page's own
   URL is appended so whoever receives it lands on this same page. */
const SHARE_TEXT = [
  "Hey! Check out the amazing deals I've found at WOK!N \u2014 the finest pan-Asian restaurant in Gulberg Greens \uD83D\uDD25",
  "",
  "Flat 20% off in Office Hours, weekend Golden Hour, and up to 50% off on bank cards.",
  "",
  "",
].join("\n");

/* Offer windows, in Pakistan Standard Time.
   days: 0=Sun … 6=Sat · from/to are 24h hours. */
const WINDOWS = [
  { id:"dealOffice", label:"OFFICE HOURS", days:[1,2,3,4,5], from:16, to:18,
    when:"Mon–Fri, 4–6 PM" },
  { id:"dealGolden", label:"GOLDEN HOUR",  days:[0,6],       from:12, to:16,
    when:"Sat & Sun, 12–4 PM" },
];

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* ------------------------------------------------------------------ */
/*  BOOT                                                              */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const form  = document.getElementById("leadForm");
  const phone = document.getElementById("fPhone");

  form.addEventListener("submit", onSubmit);
  phone.addEventListener("input", onPhoneInput);

  // clear the error state as soon as the guest starts fixing a field
  ["fName","fPhone","fEmail"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => clearFieldError(id));
  });

  flushPendingLead();          // retry a lead that couldn't be saved last time

  const saved = readSavedLead();
  if (saved) showDeals(saved, { instant:true });
});

/* ------------------------------------------------------------------ */
/*  GATE                                                              */
/* ------------------------------------------------------------------ */
async function onSubmit(e){
  e.preventDefault();

  const name  = document.getElementById("fName").value.trim();
  const email = document.getElementById("fEmail").value.trim();
  const rawPhone = document.getElementById("fPhone").value;

  let ok = true;
  if (name.length < 2){
    setFieldError("fName", "Please tell us your name."); ok = false;
  }
  const phone = normalizePhone(rawPhone);
  if (!phone){
    setFieldError("fPhone", "Enter a valid mobile, e.g. 300 1234567."); ok = false;
  }
  if (!isEmail(email)){
    setFieldError("fEmail", "That email doesn't look right."); ok = false;
  }
  if (!ok) return;

  const lead = { name, phone, email, source: SOURCE };

  const btn = document.getElementById("unlockBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "UNLOCKING…";

  const saved = await saveLead(lead);
  if (!saved) queuePendingLead(lead);      // never block the guest on our DB

  rememberLead(lead);
  showDeals(lead);
}

function setFieldError(id, msg){
  const input = document.getElementById(id);
  const err   = document.getElementById("err" + id.slice(1));   // fName → errName
  input.classList.add("is-bad");
  if (err){ err.textContent = msg; err.hidden = false; }
}
function clearFieldError(id){
  const input = document.getElementById(id);
  const err   = document.getElementById("err" + id.slice(1));
  input.classList.remove("is-bad");
  if (err) err.hidden = true;
  document.getElementById("formErr").hidden = true;
}

/* Pretty-print the local part as it's typed: 300 1234567.
   The field already shows "+92", so a pasted 0300…/+92300… is trimmed
   down to the 10-digit local number instead of doubling the prefix. */
function onPhoneInput(e){
  let d = e.target.value.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length > 10) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 10);
  e.target.value = d.length > 3 ? d.slice(0,3) + " " + d.slice(3) : d;
}

/* Accepts 03001234567 · 3001234567 · +923001234567 · 923001234567
   Returns +923001234567, or null if it isn't a Pakistani mobile. */
function normalizePhone(raw){
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  else if (d.startsWith("0"))  d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "+92" + d : null;
}

function isEmail(v){
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);
}

/* ------------------------------------------------------------------ */
/*  LEAD STORAGE                                                      */
/* ------------------------------------------------------------------ */
async function saveLead(lead){
  if (!window.db) return false;
  try {
    // No .select() on purpose — anon has INSERT rights only, so the guest
    // list can't be read back from the browser.
    const { error } = await window.db.from("qr_leads").insert({
      name:  lead.name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source || SOURCE,
      user_agent: (navigator.userAgent || "").slice(0, 300),
    });
    if (error) throw error;
    return true;
  } catch (err){
    console.warn("[wokin/deals] lead not saved:", err.message || err);
    return false;
  }
}

function rememberLead(lead){
  try { localStorage.setItem(LEAD_KEY, JSON.stringify(lead)); } catch(e){}
}
function readSavedLead(){
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    if (!raw) return null;
    const lead = JSON.parse(raw);
    return lead && lead.name ? lead : null;
  } catch(e){ return null; }
}
function queuePendingLead(lead){
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(lead)); } catch(e){}
}
async function flushPendingLead(){
  let lead;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    lead = JSON.parse(raw);
  } catch(e){ return; }
  if (!lead || !lead.phone) return;
  if (await saveLead(lead)){
    try { localStorage.removeItem(PENDING_KEY); } catch(e){}
  }
}

/* ------------------------------------------------------------------ */
/*  DEALS                                                             */
/* ------------------------------------------------------------------ */
function showDeals(lead, opts = {}){
  document.getElementById("gateScreen").hidden = true;
  const screen = document.getElementById("dealsScreen");
  screen.hidden = false;
  if (opts.instant) screen.style.animation = "none";

  const first = String(lead.name || "").trim().split(/\s+/)[0];
  document.getElementById("helloLine").textContent =
    first ? `Hey ${first} — here's what's on.` : "Here's what's on.";

  window.scrollTo(0, 0);

  setShareLink();
  markLiveOffer();
  setInterval(markLiveOffer, 60000);   // keep the "ON NOW" badge honest

  loadBanners();
}

/* ---- share on whatsapp ---- */
function setShareLink(){
  const link = document.getElementById("waShare");
  if (!link) return;
  // Share the page the guest is actually on, so the friend who opens it
  // gets the live offers (and signs up on the same gate).
  const url  = location.origin + location.pathname.replace(/\.html$/, "");
  const text = SHARE_TEXT + url;
  link.href = "https://wa.me/?text=" + encodeURIComponent(text);
}

/* ---- which offer is running right now (Pakistan time) ---- */
function pktNow(){
  // Reads the wall clock in Asia/Karachi no matter where the phone is set.
  return new Date(new Date().toLocaleString("en-US", { timeZone:"Asia/Karachi" }));
}

function markLiveOffer(){
  const now  = pktNow();
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  let live = null;
  WINDOWS.forEach(w => {
    const on = w.days.includes(day) && mins >= w.from * 60 && mins < w.to * 60;
    const card  = document.getElementById(w.id);
    const badge = card && card.querySelector(".deal-live");
    if (card)  card.classList.toggle("is-live", on);
    if (badge) badge.hidden = !on;
    if (on) live = w;
  });

  const pill = document.getElementById("livePill");
  const text = document.getElementById("liveText");
  if (live){
    pill.classList.remove("is-off");
    text.textContent = `${live.label} · ON RIGHT NOW TILL ${fmtHour(live.to)}`;
  } else {
    const next = nextWindow(day, mins);
    pill.classList.add("is-off");
    text.textContent = next
      ? `NEXT · ${next.w.label} ${next.whenLabel}`
      : "BANK CARD OFFERS RUNNING ALL WEEK";
  }
  pill.hidden = false;
}

/* Nearest upcoming window, searching today first then the next 7 days. */
function nextWindow(day, mins){
  let best = null;
  for (let ahead = 0; ahead <= 7; ahead++){
    const d = (day + ahead) % 7;
    WINDOWS.forEach(w => {
      if (!w.days.includes(d)) return;
      const startMins = ahead * 1440 + w.from * 60;
      const nowMins   = mins;
      if (startMins <= nowMins) return;            // already started / passed
      if (!best || startMins < best.startMins){
        best = { w, startMins, whenLabel: whenLabel(ahead, d, w) };
      }
    });
    if (best) break;                                // earliest day wins
  }
  return best;
}

function whenLabel(ahead, dayIndex, w){
  const at = fmtHour(w.from);
  if (ahead === 0) return `TODAY AT ${at}`;
  if (ahead === 1) return `TOMORROW AT ${at}`;
  return `${DAY_NAMES[dayIndex].toUpperCase()} AT ${at}`;
}

function fmtHour(h){
  const suffix = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${suffix}`;
}

/* ---- the website's scrolling promo banners ---- */
async function loadBanners(){
  if (!window.db) return;
  try {
    const { data, error } = await window.db.from("promo_banners")
      .select("*").eq("is_active", true).order("position", { ascending:true });
    if (error) throw error;

    const messages = (data || []).map(b => b.message).filter(Boolean);
    if (!messages.length) return;

    const track = document.getElementById("tickerTrack");
    track.innerHTML = "";
    // Printed twice so the -50% loop is seamless.
    [...messages, ...messages].forEach(msg => {
      const span = document.createElement("span");
      span.textContent = "★ " + msg;
      track.appendChild(span);
    });
    document.getElementById("ticker").hidden = false;
  } catch (err){
    console.warn("[wokin/deals] banners unavailable:", err.message || err);
  }
}
