-- =====================================================================
--  WOK!N · new-order → WhatsApp alert trigger
--  Calls the `notify-order` edge function on every new order, which
--  sends the manager a WhatsApp message. Used instead of a Database
--  Webhook (same effect, done in SQL).
--
--  Prereqs: the notify-order edge function is deployed and its secrets
--  (NOTIFY_SECRET, WA_* , META_*) are set. The x-notify-secret header
--  below MUST match the NOTIFY_SECRET secret on the function.
--
--  Run once in the Supabase SQL editor.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://awzakqhczixzwqhkhpfr.supabase.co/functions/v1/notify-order',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', 'wokin_alert_9Kp2Qm'
    ),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
after insert on public.orders
for each row
execute function public.notify_new_order();
