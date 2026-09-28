-- Owner notification rules: which kinds of notice reach owners.
--
-- Defaults live on app_settings, a client may override any of them, and the
-- check sits in `fan_out_notification`, which every notice passes through —
-- app or cron — so a switched-off kind reaches no bell, feed or phone. The
-- owner's own muted categories still apply on top.
--
-- Groups: bookings, calendar, payments, digest (morning summary + bills and
-- budget alerts), reminder (the weekly "you owe Hostello" notice).

alter table public.app_settings
  add column owner_notices jsonb not null
    default '{"bookings": true, "calendar": true, "payments": true, "digest": true, "reminder": true}'::jsonb;

-- Only the keys a client overrides; a missing key means the default.
alter table public.clients
  add column owner_notices jsonb not null default '{}'::jsonb;

create or replace function public.owner_notice_group(p_kind text)
returns text
language sql
immutable
as $$
  select case
    when p_kind in ('booking_created', 'booking_updated', 'booking_cancelled',
                    'guest_checked_in', 'guest_checked_out', 'booking_checkin_tomorrow',
                    'booking_checkin_today', 'booking_checkout_today') then 'bookings'
    when p_kind in ('dates_blocked', 'dates_unblocked', 'property_added', 'property_removed',
                    'property_change_applied', 'property_change_declined') then 'calendar'
    when p_kind in ('payment_received', 'payout_confirmed', 'payout_rejected', 'share_received',
                    'payout_sent', 'client_terms_updated') then 'payments'
    when p_kind in ('daily_digest', 'expense_due', 'expense_budget_crossed', 'expense_running_high') then 'digest'
    when p_kind = 'payment_reminder' then 'reminder'
  end;
$$;

create or replace function public.owner_notice_allowed(p_client_id uuid, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g text := owner_notice_group(p_kind);
  v boolean;
begin
  -- A kind outside every group (a digest to admins, a payout filed…) is not ours to stop.
  if g is null then
    return true;
  end if;
  select coalesce((c.owner_notices ->> g)::boolean, (s.owner_notices ->> g)::boolean, true)
    into v
    from clients c cross join app_settings s
   where c.id = p_client_id;
  return coalesce(v, true);
end;
$$;

revoke all on function public.owner_notice_allowed(uuid, text) from public, anon, authenticated;

create or replace function public.fan_out_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audience in ('admin', 'staff', 'both') then
    insert into notification_recipients (notification_id, user_id)
    select new.id, p.id
    from profiles p
    where (p.role = 'admin' or (new.audience = 'staff' and p.role = 'ops'))
      and p.id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  if new.audience in ('client', 'both') and new.client_id is not null
     and owner_notice_allowed(new.client_id, new.kind) then
    insert into notification_recipients (notification_id, user_id)
    select new.id, c.owner_user_id
    from clients c
    where c.id = new.client_id
      and c.owner_user_id is not null
      and c.deactivated_at is null
      and c.owner_user_id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ── Weekly reminder ─────────────────────────────────────────────────────────
-- The owner's "Owed to Hostello" balance, exactly as `loadOwed(…,
-- "to_hostello")` in src/lib/owed.ts works it out for the Money page:
-- confirmed stays not yet marked share_received, each one's hostello_share
-- less what confirmed payments have allocated to it, never below zero.
-- **If one of the two changes, change the other.**

create or replace function public.owed_to_hostello(p_client_id uuid)
returns table (balance numeric, stays integer, pending numeric)
language sql
stable
security definer
set search_path = public
as $$
  with open_stays as (
    select greatest(0, b.hostello_share - coalesce(
             (select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id), 0)) as outstanding
      from bookings b
     where b.client_id = p_client_id
       and b.status = 'confirmed'
       and not b.share_received
       and b.hostello_share > 0
  )
  select round(coalesce(sum(outstanding), 0), 2),
         count(*) filter (where outstanding > 0)::integer,
         coalesce((select sum(amount) from client_payouts
                    where client_id = p_client_id and status = 'pending'), 0)
    from open_stays;
$$;

revoke all on function public.owed_to_hostello(uuid) from public, anon, authenticated;

create or replace function public.notify_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := to_char(now() at time zone 'Asia/Karachi', 'IYYY-IW');
  v_sent integer := 0;
  r record;
begin
  for r in
    select c.id, o.balance, o.stays, o.pending
      from clients c
      cross join lateral owed_to_hostello(c.id) o
     where c.owner_user_id is not null
       and c.deactivated_at is null
       and o.balance > 0
  loop
    insert into notifications (kind, category, audience, title, body, client_id, event_key)
    values ('payment_reminder', 'payment', 'client',
            'You owe Hostello Rs ' || to_char(round(r.balance), 'FM999,999,999'),
            'Across ' || r.stays || ' stay' || case when r.stays = 1 then '' else 's' end || '.'
              || case when r.pending > 0
                      then ' Rs ' || to_char(round(r.pending), 'FM999,999,999') || ' you sent is awaiting Hostello''s confirmation.'
                      else ' Pay from the Money screen.' end,
            r.id, 'payment_reminder:' || r.id || ':' || v_week)
    on conflict (event_key) where event_key is not null do nothing;
    if found then v_sent := v_sent + 1; end if;
  end loop;
  return v_sent;
end;
$$;

revoke all on function public.notify_payment_reminders() from public, anon, authenticated;

-- Mondays 10:00 Karachi (05:00 UTC).
select cron.schedule('hostello-payment-reminders', '0 5 * * 1', 'select public.notify_payment_reminders();');

-- The admin reads the defaults through the same view as every other setting.
create or replace view public.app_settings_v with (security_invoker = false) as
select
  case when is_admin() then default_deal_model end as default_deal_model,
  case when is_admin() then default_monthly_fee end as default_monthly_fee,
  case when is_admin() then default_share_percent end as default_share_percent,
  case when is_admin() then default_deduct_percent end as default_deduct_percent,
  case when is_admin() then default_ota_model end as default_ota_model,
  case when is_admin() then default_ota_share_percent end as default_ota_share_percent,
  case when signed_in then checkin_time end as checkin_time,
  case when signed_in then checkout_time end as checkout_time,
  case when signed_in then short_stay_start end as short_stay_start,
  case when signed_in then short_stay_end end as short_stay_end,
  case when signed_in then default_booking_status end as default_booking_status,
  case when signed_in then ops_can_edit_prices end as ops_can_edit_prices,
  case when signed_in then ops_can_cancel end as ops_can_cancel,
  case when signed_in then ops_can_block end as ops_can_block,
  business_name,
  business_phone,
  business_email,
  business_address,
  case when signed_in then payment_accounts else '[]'::jsonb end as payment_accounts,
  case when signed_in then guest_templates else '{}'::jsonb end as guest_templates,
  case when is_admin() then owner_notices end as owner_notices
from public.app_settings
cross join lateral (select auth.uid() is not null as signed_in) s;
