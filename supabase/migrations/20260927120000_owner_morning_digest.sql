-- The owner's morning summary ------------------------------------------------
--
-- One notification per owner per morning in place of one per stay: who arrives
-- and leaves today, who arrives tomorrow, bills waiting to be confirmed, and
-- payments from Hostello waiting for them to confirm. Nothing on a day with
-- nothing in it -- an empty "here's your day" is noise.
--
-- Budgets are left out on purpose: notify_expense_alerts() tells an owner once
-- when one is crossed, and a digest repeating it every morning for the rest of
-- the month would be nagging, not news.
--
-- Like the other cron jobs it inserts directly (cron cannot call
-- emit_notification): bell and Realtime, no push.

create or replace function public.notify_owner_digest()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_sent integer;
begin
  with stays as (
    -- The same stays notify_daily_stays() looks at: not cancelled, arriving
    -- today or tomorrow, or leaving today (a short stay leaves the day it came).
    select
      b.client_id,
      b.check_in,
      b.check_out,
      b.is_short_stay,
      coalesce(b.guest_name, 'A guest') || coalesce(
        ' (' || (
          select string_agg(p.name, ', ' order by p.name)
          from booking_properties bp join properties p on p.id = bp.property_id
          where bp.booking_id = b.id
        ) || ')',
        ''
      ) as who
    from bookings b
    where b.status <> 'cancelled'
      and (
        b.check_in in (v_today, v_today + 1)
        or (b.check_out = v_today and not b.is_short_stay)
      )
  ),
  d as (
    select
      c.id as client_id,
      (select count(*) from stays s where s.client_id = c.id and s.check_in = v_today) as arr_n,
      (select string_agg(s.who, ', ' order by s.who) from stays s
        where s.client_id = c.id and s.check_in = v_today) as arr,
      (select count(*) from stays s
        where s.client_id = c.id and s.check_out = v_today and not s.is_short_stay) as dep_n,
      (select string_agg(s.who, ', ' order by s.who) from stays s
        where s.client_id = c.id and s.check_out = v_today and not s.is_short_stay) as dep,
      (select count(*) from stays s where s.client_id = c.id and s.check_in = v_today + 1) as tom_n,
      (select string_agg(s.who, ', ' order by s.who) from stays s
        where s.client_id = c.id and s.check_in = v_today + 1) as tom,
      (select count(*) from expenses e where e.client_id = c.id and not e.confirmed) as due_n,
      (select coalesce(sum(e.amount), 0) from expenses e
        where e.client_id = c.id and not e.confirmed) as due_amt,
      (select count(*) from hostello_payouts hp
        where hp.client_id = c.id and hp.status = 'pending') as pay_n,
      (select coalesce(sum(hp.amount), 0) from hostello_payouts hp
        where hp.client_id = c.id and hp.status = 'pending') as pay_amt
    from clients c
    where c.owner_user_id is not null
  )
  insert into notifications (kind, category, audience, title, body, client_id, event_key)
  select
    'daily_digest',
    'booking',
    'client',
    'Your day: ' || array_to_string(array_remove(array[
      case when arr_n > 0 then arr_n || ' arriving' end,
      case when dep_n > 0 then dep_n || ' leaving' end,
      case when tom_n > 0 then tom_n || ' tomorrow' end,
      case when due_n = 1 then '1 bill to confirm' when due_n > 1 then due_n || ' bills to confirm' end,
      case when pay_n = 1 then '1 payment to confirm' when pay_n > 1 then pay_n || ' payments to confirm' end
    ], null), ', '),
    array_to_string(array_remove(array[
      case when arr_n > 0 then 'Arriving today: ' || arr end,
      case when dep_n > 0 then 'Leaving today: ' || dep end,
      case when tom_n > 0 then 'Arriving tomorrow: ' || tom end,
      case when due_n > 0 then
        'Bills due, about Rs ' || to_char(round(due_amt), 'FM999,999,999') || ' — confirm what each came to' end,
      case when pay_n > 0 then
        'Rs ' || to_char(round(pay_amt), 'FM999,999,999') || ' sent by Hostello — confirm it reached you' end
    ], null), ' · '),
    client_id,
    'digest:' || client_id::text || ':' || v_today::text
  from d
  where arr_n + dep_n + tom_n + due_n + pay_n > 0
  on conflict (event_key) where event_key is not null do nothing;

  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke execute on function public.notify_owner_digest() from public, anon, authenticated;
grant execute on function public.notify_owner_digest() to service_role;

-- 02:15 UTC = 07:15 Karachi: after the stays (02:00), the due bills (02:05) and
-- the budget alerts (02:10), so this morning's due bills are already in it.
select cron.schedule('hostello-owner-digest', '15 2 * * *', $cron$select public.notify_owner_digest();$cron$);

comment on function public.notify_owner_digest() is
  'Run by the hostello-owner-digest cron at 02:15 UTC (07:15 Karachi): one summary per owner, only when there is something in it. event_key makes a re-run a no-op.';

-- The per-stay notices now go to the admin only -------------------------------
-- Same function as before, one word changed: audience 'both' -> 'admin'. The
-- owner reads the same stays in the digest above.

create or replace function public.notify_daily_stays()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_tomorrow date := ((now() at time zone 'Asia/Karachi')::date + 1);
  v_written integer := 0;
  r record;
begin
  for r in
    select
      b.id, b.client_id, b.guest_name, b.check_in, b.check_out, b.client_payout,
      b.is_short_stay, b.short_stay_start, b.short_stay_end, b.expected_arrival,
      coalesce(
        (select string_agg(p.name, ', ' order by p.name)
         from booking_properties bp join properties p on p.id = bp.property_id
         where bp.booking_id = b.id),
        'your property'
      ) as units,
      case
        when b.check_in = v_tomorrow then 'checkin_tomorrow'
        when b.check_in = v_today then 'checkin'
        else 'checkout'
      end as event
    from bookings b
    where b.status <> 'cancelled'
      and (
        b.check_in = v_today
        or b.check_in = v_tomorrow
        or (b.check_out = v_today and not b.is_short_stay)
      )
  loop
    insert into notifications (
      kind, category, audience, title, body,
      client_id, booking_id, event_key
    )
    values (
      case r.event
        when 'checkin_tomorrow' then 'booking_checkin_tomorrow'
        when 'checkin' then 'booking_checkin_today'
        else 'booking_checkout_today'
      end,
      'booking',
      'admin',
      case
        when r.event = 'checkin_tomorrow' and r.is_short_stay then
          coalesce(r.guest_name, 'A guest') || ' has a short stay tomorrow — ' || r.units
        when r.event = 'checkin_tomorrow' then
          coalesce(r.guest_name, 'A guest') || ' arrives tomorrow — ' || r.units
        when r.is_short_stay then coalesce(r.guest_name, 'A guest') || ' has a short stay today — ' || r.units
        when r.event = 'checkin' then coalesce(r.guest_name, 'A guest') || ' arrives today — ' || r.units
        else coalesce(r.guest_name, 'A guest') || ' checks out today — ' || r.units
      end,
      case
        when r.event = 'checkin_tomorrow' then
          (case
            when r.is_short_stay then
              to_char(r.check_in, 'DD Mon')
                || ' · ' || to_char(r.short_stay_start, 'HH12:MIam')
                || ' – ' || to_char(r.short_stay_end, 'HH12:MIam')
            else
              to_char(r.check_in, 'DD Mon') || ' → ' || to_char(r.check_out, 'DD Mon')
                || ' · ' || (r.check_out - r.check_in) || 'n'
          end)
          || (case
                when r.is_short_stay then ''
                when r.expected_arrival is not null
                  then ' · arriving ' || to_char(r.expected_arrival, 'HH12:MIam')
                else ' · arrival time not given'
              end)
          || ' · Rs ' || to_char(round(r.client_payout), 'FM999,999,999')
        when r.is_short_stay then
          to_char(r.check_in, 'DD Mon')
            || ' · ' || to_char(r.short_stay_start, 'HH12:MIam')
            || ' – ' || to_char(r.short_stay_end, 'HH12:MIam')
            || ' · Rs ' || to_char(round(r.client_payout), 'FM999,999,999')
        else
          to_char(r.check_in, 'DD Mon') || ' → ' || to_char(r.check_out, 'DD Mon')
            || ' · ' || (r.check_out - r.check_in) || 'n'
            || ' · Rs ' || to_char(round(r.client_payout), 'FM999,999,999')
      end,
      r.client_id,
      r.id,
      r.event || ':' || r.id::text || ':'
        || (case when r.event = 'checkin_tomorrow' then v_tomorrow else v_today end)::text
    )
    on conflict (event_key) where event_key is not null do nothing;

    if found then
      v_written := v_written + 1;
    end if;
  end loop;

  return v_written;
end;
$function$;
