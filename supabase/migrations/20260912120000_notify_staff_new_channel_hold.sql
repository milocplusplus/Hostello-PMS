-- ── A channel reservation lands, and the people who have to type it up hear ──
--
-- Airbnb's iCal gives dates and the word "Reserved". Nobody was told it had
-- arrived: it appeared as a bar on a calendar somebody had to be looking at.
-- The sync now says so, to admin *and* ops, once per imported reservation.
--
-- Two things had to change for ops to be told anything at all:
--   1. `audience` gains 'staff'. It exists because 'admin' must stay what it is
--      — most admin notifications carry money, and the split is exactly what
--      ops is kept away from. Only a notice with no figures in it may say
--      'staff', and this one has none.
--   2. `fan_out_notification` learns to deliver it. Ops has had a bell in the
--      shell since the beginning and has never once had a row in it.

alter table notifications drop constraint notifications_audience_check;
alter table notifications add constraint notifications_audience_check
  check (audience = any (array['admin', 'staff', 'client', 'both']));

comment on column notifications.audience is
  'Who the fan-out delivers to: admin (owners only — anything with money in it), staff (admin + ops), client (the owning portal user), both (admin + client).';

create or replace function public.fan_out_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- 'staff' is 'admin' plus ops. Kept as one branch so a row is never delivered
  -- twice to an admin who matches both.
  if new.audience in ('admin', 'staff', 'both') then
    insert into notification_recipients (notification_id, user_id)
    select new.id, p.id
    from profiles p
    where (p.role = 'admin' or (new.audience = 'staff' and p.role = 'ops'))
      and p.id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  if new.audience in ('client', 'both') and new.client_id is not null then
    insert into notification_recipients (notification_id, user_id)
    select new.id, c.owner_user_id
    from clients c
    where c.id = new.client_id
      and c.owner_user_id is not null
      and c.owner_user_id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- Unchanged but for the new-reservation notice at the end. Everything else --
-- the upsert, the removal rule, the clash loop -- is as it was.
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
  v_channel text;
  v_added integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_clashes integer := 0;
  v_count integer := 0;
  v_new_holds jsonb := '[]'::jsonb;
  r record;
  h jsonb;
begin
  select * into v_feed from public.calendar_feeds where id = p_feed_id;

  if not found then
    return jsonb_build_object('error', 'That calendar link no longer exists.');
  end if;

  select p.name, p.client_id into v_property_name, v_client_id
    from public.properties p
   where p.id = v_feed.property_id;

  -- The one place SQL has to name a channel. Everywhere in the app the label
  -- comes from src/lib/block-sources.ts off the row's `source`, but a
  -- notification title is text at the moment it is written, and "a channel"
  -- is not what an ops phone needs to read at 11pm. Keep the two in step.
  v_channel := case v_feed.source
                 when 'airbnb' then 'Airbnb'
                 when 'booking_com' then 'Booking.com'
                 else 'A channel'
               end;

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
    returning id, start_date, end_date, block_type, (xmax = 0) as was_insert
  )
  select coalesce(count(*) filter (where was_insert), 0),
         coalesce(count(*) filter (where not was_insert), 0),
         -- Only a reservation, only the first time it is seen, only while the
         -- nights are still ahead. An edit to one already reported is not news,
         -- and a feed's back catalogue on the day it is connected is not either.
         coalesce(
           jsonb_agg(jsonb_build_object('id', id, 'start', start_date, 'end', end_date))
             filter (where was_insert and block_type = 'booked' and end_date >= current_date),
           '[]'::jsonb
         )
    into v_added, v_updated, v_new_holds
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

  -- A reservation arrived and it has no guest and no price, because iCal
  -- carries neither. Somebody has to type them in, so somebody has to be told:
  -- admin and ops both, since ops is who works the arrival.
  --
  -- Category is `booking`, not `calendar`: this is a stay to write up, and
  -- muting the chatter of owners blocking and unblocking dates must not also
  -- silence it. The row carries no money, which is what lets ops see it.
  --
  -- No push banner — a notification written in SQL never reaches deliverPush()
  -- in src/lib/push.ts. It lands in the bell and on the notifications page,
  -- live, the same way a clash does.
  for h in select * from jsonb_array_elements(v_new_holds)
  loop
    insert into public.notifications
      (kind, category, audience, title, body, client_id, property_id, event_key)
    values (
      'channel_reservation',
      'booking',
      'staff',
      v_channel || ' booked ' || coalesce(v_property_name, 'a property') || ' — add the details',
      case when (h ->> 'start')::date = (h ->> 'end')::date
           then to_char((h ->> 'start')::date, 'DD Mon')
           else to_char((h ->> 'start')::date, 'DD Mon') || ' → ' || to_char((h ->> 'end')::date, 'DD Mon')
      end
        || ' · The channel sent dates and nothing else. Open the calendar and'
        || ' add the guest and the price.',
      v_client_id,
      v_feed.property_id,
      'channel_reservation:' || (h ->> 'id')
    )
    on conflict (event_key) where event_key is not null do nothing;
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
