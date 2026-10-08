// =====================================================================
//  WOK!N · notify-order  ·  Supabase Edge Function (Deno)
//  ---------------------------------------------------------------------
//  Fires when a new order is inserted and sends a WhatsApp alert to the
//  manager so an order is never missed, even when nobody is looking at
//  the admin dashboard.
//
//  Triggered by a Supabase Database Webhook on INSERT into `orders`
//  (see WHATSAPP-ALERTS-SETUP.md). The webhook sends:
//     { type:"INSERT", table:"orders", record:{...the order row...} }
//
//  Supported providers (set WA_PROVIDER):
//    - "meta"   → WhatsApp Cloud API (official, cheapest)
//    - "twilio" → Twilio WhatsApp
//
//  Required secrets (Supabase → Edge Functions → Secrets):
//    NOTIFY_SECRET          shared secret; must match the webhook header
//    WA_PROVIDER            "meta" | "twilio"
//    MANAGER_WHATSAPP       manager number in E.164, e.g. 923001234567
//    SUPABASE_URL           (auto-set by Supabase)
//    SUPABASE_SERVICE_ROLE_KEY   to read the order's items
//    WA_TEMPLATE            approved template name (e.g. "wokin_new_order")
//    WA_LANG                template language code (e.g. "en")  [optional, default "en"]
//   Meta:
//    META_PHONE_NUMBER_ID   WhatsApp phone-number id
//    META_TOKEN             permanent access token
//   Twilio:
//    TWILIO_ACCOUNT_SID
//    TWILIO_AUTH_TOKEN
//    TWILIO_WA_FROM         sender, e.g. 14155238886  (no "whatsapp:" prefix)
//    TWILIO_CONTENT_SID     approved Content template SID (HX...)
// =====================================================================

const env = (k: string) => Deno.env.get(k) || "";

const PKR = (n: unknown) => "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-PK");

function orderLine(o: Record<string, unknown>): { type: string; where: string } {
  const t = String(o.order_type || "");
  if (t === "dine-in") return { type: "Dine-in", where: String(o.table_label || "") };
  if (t === "pickup")  return { type: "Pickup",  where: "counter" };
  return { type: "Delivery", where: String(o.area || o.address || "") };
}

async function fetchItems(orderId: string): Promise<string> {
  try {
    const url = `${env("SUPABASE_URL")}/rest/v1/order_items?select=dish_name,variant,quantity&order_id=eq.${orderId}`;
    const r = await fetch(url, {
      headers: {
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    });
    if (!r.ok) return "";
    const rows = await r.json();
    return (rows || [])
      .map((i: Record<string, unknown>) =>
        `${i.quantity}× ${i.dish_name}${i.variant ? " (" + i.variant + ")" : ""}`)
      .join(", ")
      .slice(0, 900); // keep within WhatsApp template param limits
  } catch { return ""; }
}

async function sendMeta(to: string, params: string[]): Promise<Response> {
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: env("WA_TEMPLATE"),
      language: { code: env("WA_LANG") || "en" },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  };
  return await fetch(`https://graph.facebook.com/v21.0/${env("META_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("META_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendTwilio(to: string, params: string[]): Promise<Response> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const form = new URLSearchParams();
  form.set("To", `whatsapp:+${to}`);
  form.set("From", `whatsapp:+${env("TWILIO_WA_FROM")}`);
  form.set("ContentSid", env("TWILIO_CONTENT_SID"));
  // Twilio content variables are addressed by number "1","2",...
  const vars: Record<string, string> = {};
  params.forEach((p, i) => (vars[String(i + 1)] = p));
  form.set("ContentVariables", JSON.stringify(vars));
  return await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${env("TWILIO_AUTH_TOKEN")}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
}

Deno.serve(async (req) => {
  // 1) authenticate the webhook
  if (req.headers.get("x-notify-secret") !== env("NOTIFY_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const o = (payload.record || payload.new || payload) as Record<string, unknown>;
  if (!o || !o.order_number) return new Response("no order", { status: 200 });

  const { type, where } = orderLine(o);
  const items = await fetchItems(String(o.id || ""));

  // Template body params — must match the approved template's {{1}}..{{4}}:
  //   {{1}} order number   {{2}} type + location   {{3}} items   {{4}} total
  const params = [
    String(o.order_number),
    where ? `${type} · ${where}` : type,
    items || "see dashboard",
    PKR(o.total),
  ];

  try {
    const provider = (env("WA_PROVIDER") || "meta").toLowerCase();
    // MANAGER_WHATSAPP may be a comma-separated list of numbers.
    const recipients = env("MANAGER_WHATSAPP").split(",").map((s) => s.trim()).filter(Boolean);
    const results = [];
    for (const to of recipients) {
      const res = provider === "twilio" ? await sendTwilio(to, params) : await sendMeta(to, params);
      const txt = await res.text();
      if (!res.ok) console.error("[notify-order] send failed", to, res.status, txt);
      results.push({ to, ok: res.ok, status: res.status });
    }
    return new Response(JSON.stringify({ sent: results }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-order] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
});
