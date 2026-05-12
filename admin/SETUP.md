# WOK!N · Admin Setup

Three steps to get the admin dashboard live. Total time: **~5 minutes.**

---

## 1. Run the database schema

This creates the `orders` + `order_items` tables, the security policies,
and turns on real-time updates.

1. Open your Supabase project → **SQL Editor** (left sidebar)
2. Click **+ New query**
3. Open the file `supabase-setup.sql` from this repo, copy all of it
4. Paste into the SQL editor
5. Click **Run** (bottom right)

You should see **"Success. No rows returned."**

To verify, go to **Table Editor** — you should see `orders` and `order_items`
listed, both with the green "RLS enabled" badge.

---

## 2. Create your admin user

This is the email + password your restaurant staff will use to sign in.

1. Supabase → **Authentication** (left sidebar) → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email**: e.g. `admin@wearewokin.com` (any email — doesn't need to be real)
   - **Password**: pick a strong one
   - ✅ **Auto Confirm User** (toggle this ON so you don't need email verification)
4. Click **Create user**

Add more users later for each staff member who needs access.

---

## 3. (Optional) Tighten email confirmations

By default Supabase requires email confirmation for new signups. We never
let anonymous users sign up (only admin creates users), so this is fine —
but if you ever invite people, go to:

**Authentication → Sign In / Up → Email Auth** → set **Confirm email** to OFF
if you don't want to verify their address.

---

## 4. Visit the admin

Go to **https://www.wearewokin.com/admin/**

Sign in with the user you just created. You'll see the live orders board.
Try placing a test order from `https://www.wearewokin.com/` — it should
appear in the **NEW** column instantly with a ding sound.

---

## What you can do in the dashboard

| Action | How |
|---|---|
| See new orders | Top-left "NEW" column · plays a ding + flashes on arrival |
| Open order detail | Click any order card |
| Accept → Cook → Ready → Out → Delivered | Big green button at the bottom of the modal |
| Cancel an order | Red button on the modal · optionally enter a reason |
| Print a receipt | Black "PRINT RECEIPT" button → uses browser print dialog |
| Today's totals | The 5 stat cards at the top |
| Phone the customer | Click the phone number in the modal |
| Open the GPS pin on Google Maps | Click "📍 Open in Maps" link in modal |

---

## Troubleshooting

**"Invalid login credentials"** when signing in
→ You probably created the user with email confirmation required. Go to
**Authentication → Users**, find your user, click the `⋮` menu →
**Send magic link** or just confirm the email manually.

**Orders aren't appearing live**
→ Open browser DevTools console; if you see realtime errors, go to
**Database → Replication** → make sure **supabase_realtime** is enabled
and includes both `orders` and `order_items`.

**Customer site shows "couldn't place order"**
→ Check the JS console on the customer site. Most likely the publishable
key in `supabase-client.js` is wrong (the screenshot you sent was truncated).
Verify it matches **Settings → API Keys → Publishable** exactly.
