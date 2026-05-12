/* =====================================================================
   WOK!N  ·  SUPABASE CLIENT  (shared between customer site + admin)
   ---------------------------------------------------------------------
   The supabase-js UMD bundle is loaded via CDN in each HTML file BEFORE
   this script, so `supabase.createClient(...)` is globally available.

   The publishable key below is safe to ship to the browser. All
   sensitive operations are gated by Row-Level Security policies in
   supabase-setup.sql:
     - anonymous users  → INSERT into orders / order_items only
     - authenticated    → full read + update (admin dashboard)
   ===================================================================== */

const SUPABASE_URL = "https://awzakqhczixzwqhkhpfr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3emFrcWhjeml4endxaGtocGZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODc4NzMsImV4cCI6MjA5NDE2Mzg3M30.9OSzMPLLp5eqAl1_jXCuVjdTTCnLOW6ysRh5MccSoLA";

window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 4 },
  },
});

// expose URL for admin debugging
window.SUPABASE_URL = SUPABASE_URL;
