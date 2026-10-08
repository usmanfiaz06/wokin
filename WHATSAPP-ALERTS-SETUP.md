# WOK!N — WhatsApp new-order alerts (setup)

When a customer places an order, the manager gets a WhatsApp message like:

> 🔔 *New WOK!N order W-1043*
> Dine-in · Table 4
> 2× Chicken Chow Mein, 1× Hot & Sour Soup
> Total: Rs. 2,360
> Open the dashboard to accept.

It's server-side (your keys never touch the website). The pieces:

1. A **WhatsApp sender** + an **approved message template** (provider).
2. The **`notify-order` Edge Function** (already in this repo: `supabase/functions/notify-order/`).
3. A **Database Webhook** that runs the function on every new order.

WhatsApp requires a pre-approved *template* for business-initiated messages — this is a WhatsApp rule, not ours. Approval is usually same-day.

---

## Option A — Meta WhatsApp Cloud API (recommended: official, cheapest)

### 1. Create the WhatsApp sender
1. Go to **developers.facebook.com** → create an app → add the **WhatsApp** product.
2. In **WhatsApp → API Setup**, note the **Phone number ID** and a temporary token. Add the manager's number as a test recipient to try it immediately. For production, add a real business number and generate a **permanent access token** (System User token with `whatsapp_business_messaging`).

### 2. Create the message template
In **WhatsApp Manager → Message templates → Create**:
- **Name:** `wokin_new_order`
- **Category:** Utility
- **Language:** English
- **Body:**
  ```
  🔔 New WOK!N order {{1}}
  {{2}}
  Items: {{3}}
  Total: {{4}} — open the dashboard to accept.
  ```
- Submit. Wait for **Approved** (usually minutes–hours).

### 3. Set the function secrets
Supabase → **Edge Functions → Secrets** (or `supabase secrets set`):
```
NOTIFY_SECRET        = <make up a long random string>
WA_PROVIDER          = meta
MANAGER_WHATSAPP     = 923001234567        # manager number, E.164, no + or spaces
WA_TEMPLATE          = wokin_new_order
WA_LANG              = en
META_PHONE_NUMBER_ID = <from step 1>
META_TOKEN           = <permanent token from step 1>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

---

## Option B — Twilio WhatsApp (fastest to test)

1. Create a **Twilio** account → Messaging → **Try WhatsApp** (sandbox) to test in minutes; for production, request a WhatsApp sender.
2. Create a **Content template** (Utility) with the same body + 4 variables; note its **Content SID** (`HX...`).
3. Secrets:
```
NOTIFY_SECRET      = <same random string>
WA_PROVIDER        = twilio
MANAGER_WHATSAPP   = 923001234567
TWILIO_ACCOUNT_SID = AC...
TWILIO_AUTH_TOKEN  = ...
TWILIO_WA_FROM     = 14155238886           # your Twilio WhatsApp sender, no +
TWILIO_CONTENT_SID = HX...
```

---

## Deploy the function

**Dashboard way (no CLI):** Supabase → **Edge Functions → Create a function** → name it `notify-order` → paste the contents of `supabase/functions/notify-order/index.ts` → Deploy.

**CLI way:**
```
supabase functions deploy notify-order --no-verify-jwt
```
(`--no-verify-jwt` because the webhook authenticates with our own `NOTIFY_SECRET` header instead.)

The function URL will be:
`https://<project-ref>.supabase.co/functions/v1/notify-order`

---

## Connect it to new orders (Database Webhook)

Supabase → **Database → Webhooks → Create a new hook**:
- **Table:** `public.orders`
- **Events:** `INSERT`
- **Type:** HTTP Request → **POST**
- **URL:** the function URL above
- **HTTP headers:** add `x-notify-secret` = the same value as `NOTIFY_SECRET`

Save. Place a test order on the site — the manager's WhatsApp should buzz within a couple of seconds.

> Tip: you can send to more than one number by setting `MANAGER_WHATSAPP` to the owner's number and adding staff later — ask and we'll extend the function to a list.

---

## Troubleshooting
- **No message:** Supabase → Edge Functions → `notify-order` → **Logs**. A 401 means the webhook header doesn't match `NOTIFY_SECRET`; a Meta/Twilio error body tells you if the template name/number is wrong.
- **"template not found":** the `WA_TEMPLATE` / `TWILIO_CONTENT_SID` must match the *approved* template exactly (name + language).
- **Delivered but not to the manager:** check `MANAGER_WHATSAPP` is E.164 with country code and no `+`/spaces (e.g. `923001234567`).
