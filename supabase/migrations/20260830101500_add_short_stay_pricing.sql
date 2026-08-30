-- Short stays (a few hours, not a night) priced off their own stack rate.
--
-- A short stay is still stored as a one-night booking: check_out = check_in + 1.
-- That is deliberate — every night-based query in the app (availability, the
-- calendar, occupancy, `calculatePayout`) keeps working untouched, and the
-- stack deduction lands as `short_stay_stack_rate * 1 night`, i.e. flat per
-- stay. `is_short_stay` + the two times are what say "hours, not a night", and
-- the departure day of a short stay is its check_in, never its check_out.

alter table public.properties
  add column if not exists short_stay_stack_rate numeric not null default 0;

comment on column public.properties.short_stay_stack_rate is
  'Flat stack rate for one short stay (hours), the short-stay counterpart of stack_rate. 0 = this unit does not do short stays.';

alter table public.bookings
  add column if not exists is_short_stay boolean not null default false,
  add column if not exists short_stay_start time,
  add column if not exists short_stay_end time;

-- A short stay occupies exactly one date and always carries its hours.
alter table public.bookings
  drop constraint if exists bookings_short_stay_shape;

alter table public.bookings
  add constraint bookings_short_stay_shape check (
    not is_short_stay
    or (
      check_out = check_in + 1
      and short_stay_start is not null
      and short_stay_end is not null
      and short_stay_end > short_stay_start
    )
  );

-- The daily arrival/departure notifier: a short stay leaves on the day it
-- arrives, so it must not announce a check-out the following morning.
create or replace function public.notify_daily_stays()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
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
      coalesce(
        (select string_agg(p.name, ', ' order by p.name)
         from booking_properties bp join properties p on p.id = bp.property_id
         where bp.booking_id = b.id),
        'your property'
      ) as units,
      case when b.check_in = v_today then 'checkin' else 'checkout' end as event
    from bookings b
    where b.status <> 'cancelled'
      and (b.check_in = v_today or (b.check_out = v_today and not b.is_short_stay))
  loop
    insert into notifications (
      kind, category, audience, title, body,
      client_id, booking_id, event_key
    )
    values (
      case when r.event = 'checkin' then 'booking_checkin_today' else 'booking_checkout_today' end,
      'booking',
      'both',
      case
        when r.is_short_stay then coalesce(r.guest_name, 'A guest') || ' has a short stay today — ' || r.units
        when r.event = 'checkin' then coalesce(r.guest_name, 'A guest') || ' arrives today — ' || r.units
        else coalesce(r.guest_name, 'A guest') || ' checks out today — ' || r.units
      end,
      case
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
      r.event || ':' || r.id::text || ':' || v_today::text
    )
    on conflict (event_key) where event_key is not null do nothing;

    if found then
      v_written := v_written + 1;
    end if;
  end loop;

  return v_written;
end;
$function$;
