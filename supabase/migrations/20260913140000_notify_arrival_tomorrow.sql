-- The day-before arrival reminder -------------------------------------------
--
-- `notify_daily_stays()` ran at 02:00 UTC = 07:00 Karachi and only ever spoke
-- about today. Being told at 07:00 that someone arrives *today* is not notice,
-- it is an announcement -- the keys, the cleaner and the meeting are all things
-- that need a day. This adds a third event on the same job: one notice the
-- morning before, so there is a day to act in.
--
-- No new cron entry and no new table. `hostello-daily-stays` already fires this
-- function once a day; it now writes three kinds instead of two.
--
-- Written straight into `notifications` rather than through `emit_notification`,
-- like the two events it joins: a cron has no `auth.uid()` and that RPC raises
-- on a null one. Application code still goes through notify.ts.

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
      b.id,
      b.client_id,
      b.guest_name,
      b.check_in,
      b.check_out,
      b.client_payout,
      b.is_short_stay,
      b.short_stay_start,
      b.short_stay_end,
      -- Only the day-before notice reads this. It is the one figure that
      -- decides whether somebody has to be at the door at 8am or at 8pm.
      b.expected_arrival,
      coalesce(
        (select string_agg(p.name, ', ' order by p.name)
         from booking_properties bp join properties p on p.id = bp.property_id
         where bp.booking_id = b.id),
        'your property'
      ) as units,
      -- A row can only ever match one of these: check_out is strictly after
      -- check_in, so today and tomorrow cannot both be an arrival, and an
      -- arrival tomorrow cannot be a departure today.
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
      -- Same audience as the two it joins: the owner and the admins, never
      -- ops. The body carries client_payout, which is a split figure.
      'both',
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
        -- The dates exactly as the other two word them, then the arrival time
        -- ahead of the money: tomorrow, the hour is the thing to act on.
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
          -- A short stay's window already opens with the hour they arrive, so
          -- saying it again reads as two different facts. The booking pages
          -- make the same call: they render expected_arrival only when the
          -- stay is not a short one.
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
      -- Keyed on the arrival date, not on the day the job ran, so the reminder
      -- and the next morning's `checkin` notice are different rows and neither
      -- can be written twice however often the job repeats.
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

comment on function public.notify_daily_stays() is
  'Run once a day by the hostello-daily-stays cron at 02:00 UTC (07:00 Karachi). Writes booking_checkin_tomorrow, booking_checkin_today and booking_checkout_today. event_key makes a re-run a no-op.';
