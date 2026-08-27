-- ─── Today's arrivals and departures ──────────────────────────────────────────
-- The only notifications in this app that are not caused by someone clicking
-- something. No API route handlers exist here by design, so the schedule lives
-- in the database: pg_cron calls this, it writes rows, the fan-out trigger routes
-- them and Realtime delivers them. The event_key is what makes a re-run a no-op.
--
-- Applied to the live database 2026-08-27.

create extension if not exists pg_cron with schema cron;

create or replace function public.notify_daily_stays()
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
      coalesce(
        (select string_agg(p.name, ', ' order by p.name)
         from booking_properties bp join properties p on p.id = bp.property_id
         where bp.booking_id = b.id),
        'your property'
      ) as units,
      case when b.check_in = v_today then 'checkin' else 'checkout' end as event
    from bookings b
    where b.status <> 'cancelled'
      and (b.check_in = v_today or b.check_out = v_today)
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
        when r.event = 'checkin' then coalesce(r.guest_name, 'A guest') || ' arrives today — ' || r.units
        else coalesce(r.guest_name, 'A guest') || ' checks out today — ' || r.units
      end,
      to_char(r.check_in, 'DD Mon') || ' → ' || to_char(r.check_out, 'DD Mon')
        || ' · ' || (r.check_out - r.check_in) || 'n'
        || ' · Rs ' || to_char(round(r.client_payout), 'FM999,999,999'),
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
$$;

revoke execute on function public.notify_daily_stays() from public, anon, authenticated;

-- 02:00 UTC = 07:00 Asia/Karachi, every day.
select cron.schedule('hostello-daily-stays', '0 2 * * *', $cron$select public.notify_daily_stays();$cron$);
