-- ── An imported channel hold becomes a booking ──────────────────────────────
--
-- Airbnb's iCal carries dates and a word ("Reserved") and nothing else, so an
-- imported reservation lands as a block with no guest and no money. An admin
-- can now type those in: the calendar bar opens the ordinary booking form
-- prefilled, and the block that started it records which booking it became.
--
-- The block is kept, not deleted. The channel still holds those nights, and the
-- next sync would only bring the row back. What the link changes is that the
-- two stop being drawn twice and stop being reported as a clash with each
-- other -- they are one reservation seen from two sides.
alter table calendar_blocks
  add column booking_id uuid references bookings(id) on delete set null;

comment on column calendar_blocks.booking_id is
  'The booking this imported channel hold turned into. Set only on feed-owned rows, by the admin booking write.';

create index calendar_blocks_booking_id_idx
  on calendar_blocks (booking_id) where booking_id is not null;

-- Unchanged but for the clash loop: a block that *is* the booking it overlaps
-- must not be reported as clashing with it. Everything else is as it was.
create or replace function public.sync_calendar_feed_apply(p_feed_id uuid, p_events jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_feed public.calendar_feeds%rowtype;
  v_property_name text;
  v_client_id uuid;
  v_added integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_clashes integer := 0;
  v_count integer := 0;
  r record;
begin
  select * into v_feed from public.calendar_feeds where id = p_feed_id;

  if not found then
    return jsonb_build_object('error', 'That calendar link no longer exists.');
  end if;

  select p.name, p.client_id into v_property_name, v_client_id
    from public.properties p
   where p.id = v_feed.property_id;

  -- Insert what is new, update only what actually differs. `distinct on` is
  -- load-bearing: ON CONFLICT cannot touch the same key twice in one statement,
  -- and a feed is free to repeat a UID. Last occurrence wins.
  with events as (
    select distinct on (v.uid)
           v.uid, v.first_night, v.last_night, v.block_type, v.notes
      from (
        select e.value ->> 'uid' as uid,
               (e.value ->> 'start')::date as first_night,
               (e.value ->> 'end')::date as last_night,
               case
                 when lower(coalesce(e.value ->> 'summary', '')) like '%not available%'
                   or lower(coalesce(e.value ->> 'summary', '')) like '%blocked%'
                 then 'blocked'::public.calendar_block_type
                 else 'booked'::public.calendar_block_type
               end as block_type,
               -- Just the channel's own wording. The channel *name* is not
               -- repeated here: the row carries `source`, and the UI renders
               -- the label from src/lib/block-sources.ts. One place, not two.
               nullif(left(coalesce(e.value ->> 'summary', ''), 500), '') as notes,
               e.ord
          from jsonb_array_elements(p_events) with ordinality as e(value, ord)
      ) v
     where v.uid is not null
       and v.first_night is not null
       and v.last_night is not null
     order by v.uid, v.ord desc
  ),
  upserted as (
    insert into public.calendar_blocks
      (property_id, start_date, end_date, block_type, source, notes, feed_id, external_uid)
    select v_feed.property_id, ev.first_night, ev.last_night, ev.block_type,
           v_feed.source, ev.notes, v_feed.id, ev.uid
      from events ev
    on conflict (feed_id, external_uid) where feed_id is not null
    do update set
      start_date = excluded.start_date,
      end_date   = excluded.end_date,
      block_type = excluded.block_type,
      source     = excluded.source,
      notes      = excluded.notes
    where calendar_blocks.start_date is distinct from excluded.start_date
       or calendar_blocks.end_date   is distinct from excluded.end_date
       or calendar_blocks.block_type is distinct from excluded.block_type
       or calendar_blocks.notes      is distinct from excluded.notes
    returning (xmax = 0) as was_insert
  )
  select coalesce(count(*) filter (where was_insert), 0),
         coalesce(count(*) filter (where not was_insert), 0)
    into v_added, v_updated
    from upserted;

  -- Gone from the feed means cancelled on the channel, so the nights reopen.
  -- Past rows are left alone: OTA feeds trim their own history and following
  -- that would quietly erase what the calendar showed last month.
  with removed as (
    delete from public.calendar_blocks cb
     where cb.feed_id = v_feed.id
       and cb.end_date >= current_date
       and not exists (
         select 1 from jsonb_array_elements(p_events) as e
          where e.value ->> 'uid' = cb.external_uid
       )
    returning 1
  )
  select count(*) into v_removed from removed;

  select count(distinct e.value ->> 'uid') into v_count
    from jsonb_array_elements(p_events) as e
   where e.value ->> 'uid' is not null;

  -- The whole point of importing: a channel just sold a night we had also sold.
  -- Same kind, category and event_key shape as notifyCalendarConflict() in
  -- src/lib/notify.ts, so the two paths collapse instead of double-reporting.
  --
  -- `cb.booking_id` is the exception: that booking *is* this hold, typed up by
  -- an admin. Reporting it would be the sync arguing with itself.
  for r in
    select b.id as booking_id, b.guest_name, cb.start_date, cb.end_date
      from public.calendar_blocks cb
      join public.booking_properties bp on bp.property_id = cb.property_id
      join public.bookings b on b.id = bp.booking_id
     where cb.feed_id = v_feed.id
       and cb.end_date >= current_date
       and cb.booking_id is distinct from b.id
       and b.status <> 'cancelled'
       and b.check_in <= cb.end_date
       and b.check_out > cb.start_date
  loop
    insert into public.notifications
      (kind, category, audience, title, body, client_id, booking_id, property_id, event_key)
    values (
      'calendar_conflict',
      'critical',
      'admin',
      'Block clashes with a booking on ' || coalesce(v_property_name, 'a property'),
      case when r.start_date = r.end_date
           then to_char(r.start_date, 'DD Mon')
           else to_char(r.start_date, 'DD Mon') || ' → ' || to_char(r.end_date, 'DD Mon')
      end
        || ' · ' || coalesce(r.guest_name, 'A guest')
        || ' is booked on those nights. One of the two has to give.',
      v_client_id,
      r.booking_id,
      v_feed.property_id,
      'calendar_conflict:' || r.booking_id::text || ':' || r.start_date::text || ':' || r.end_date::text
    )
    on conflict (event_key) where event_key is not null do nothing;

    if found then
      v_clashes := v_clashes + 1;
    end if;
  end loop;

  update public.calendar_feeds
     set last_synced_at = now(),
         last_error = null,
         last_event_count = v_count
   where id = v_feed.id;

  return jsonb_build_object(
    'added', v_added, 'updated', v_updated, 'removed', v_removed, 'clashes', v_clashes
  );
end;
$function$;
