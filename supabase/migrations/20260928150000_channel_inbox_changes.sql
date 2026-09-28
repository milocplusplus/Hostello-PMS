-- ── Channel inbox, part 3: changes, cancellations, requests, missing mail ────
--
-- A channel reports one reservation twice: by email, and through the iCal the
-- sync imports every minute. Part 2 made a new reservation's two reports meet.
-- This makes the *later* reports meet too — a cancellation, a date change, a
-- request that became a booking — and says so when only one of the two ever
-- arrives.

-- How a cancellation or change mail found its booking: by the channel's code,
-- or (for a stay entered before codes were kept) by guest, dates and unit —
-- which the reviewer should know is a weaker match.
alter table ota_messages add column booking_match text
  check (booking_match in ('code', 'guest_dates'));

-- ── A hold that lands on a booking already in the book ─────────────────────
--
-- Someone types an Airbnb stay in by hand, or approves a request to book, and
-- a minute later the sync imports the same nights as a "Reserved" hold. They
-- are one reservation, but until now the sync called them a clash. When a
-- live booking from the same channel has exactly the hold's nights on its
-- unit, and no other hold is its already, the hold is linked to it on the
-- way in — exactly what approving with `from_block` does.

create function link_channel_hold_to_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.feed_id is null or new.booking_id is not null then
    return new;
  end if;

  select b.id into new.booking_id
    from bookings b
    join booking_properties bp on bp.booking_id = b.id and bp.property_id = new.property_id
   where b.status <> 'cancelled'
     and b.source = new.source
     and b.check_in = new.start_date
     and b.check_out = new.end_date + 1
     and not exists (select 1 from calendar_blocks cb where cb.booking_id = b.id and cb.feed_id is not null)
   limit 1;

  return new;
end;
$fn$;

create trigger calendar_blocks_link_booking
  before insert on calendar_blocks
  for each row execute function link_channel_hold_to_booking();

-- ── The calendar changed a booked stay, whether or not a mail says so ───────
--
-- The sync keeps a hold's row (and its link to the booking) when the channel
-- moves its dates, and deletes it when the channel cancels. Either way the
-- booking here still says what it said — so staff are told, and the inbox
-- card for the matching mail (if one comes) shows the same thing.

create function channel_hold_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row     calendar_blocks;
  v_book    record;
  v_unit    text;
  v_channel text;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;

  if v_row.feed_id is null or v_row.booking_id is null then
    return null;
  end if;

  -- The link itself being deleted takes its holds with it; that is not the
  -- channel saying anything.
  if tg_op = 'DELETE' and not exists (select 1 from calendar_feeds where id = old.feed_id) then
    return null;
  end if;

  select b.id, b.client_id, b.guest_name, b.check_in, b.check_out, b.status into v_book
    from bookings b where b.id = v_row.booking_id;
  if not found or v_book.status = 'cancelled' then
    return null;
  end if;

  select name into v_unit from properties where id = v_row.property_id;
  v_channel := case v_row.source when 'airbnb' then 'Airbnb' when 'booking_com' then 'Booking.com' else 'The channel' end;

  if tg_op = 'DELETE' then
    insert into notifications (kind, category, audience, title, body, client_id, property_id, booking_id, event_key)
    values (
      'channel_stay_dropped', 'critical', 'staff',
      v_channel || ' no longer shows ' || coalesce(v_book.guest_name, 'a guest') || '''s stay',
      coalesce(v_unit, 'A unit') || ', ' || to_char(v_book.check_in, 'DD Mon') || ' → ' ||
        to_char(v_book.check_out, 'DD Mon') || '. The channel freed these nights — if the guest ' ||
        'cancelled, cancel the booking here too; the nights stay closed until you do.',
      v_book.client_id, v_row.property_id, v_book.id,
      'stay-dropped:' || v_book.id || ':' || old.id
    )
    on conflict (event_key) where event_key is not null do nothing;
  elsif new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    if v_book.check_in = new.start_date and v_book.check_out = new.end_date + 1 then
      return null;  -- the booking was changed first; the calendar has caught up
    end if;

    insert into notifications (kind, category, audience, title, body, client_id, property_id, booking_id, event_key)
    values (
      'channel_stay_moved', 'critical', 'staff',
      v_channel || ' moved ' || coalesce(v_book.guest_name, 'a guest') || '''s stay',
      coalesce(v_unit, 'A unit') || ': now ' || to_char(new.start_date, 'DD Mon') || ' → ' ||
        to_char(new.end_date + 1, 'DD Mon') || ', booked here as ' ||
        to_char(v_book.check_in, 'DD Mon') || ' → ' || to_char(v_book.check_out, 'DD Mon') ||
        '. If the change email has arrived, apply it from the channel inbox; if not, check the ' ||
        'reservation and use Change dates on the booking.',
      v_book.client_id, new.property_id, v_book.id,
      'stay-moved:' || v_book.id || ':' || new.start_date || ':' || new.end_date
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  return null;
end;
$fn$;

create trigger calendar_blocks_channel_changed
  after update of start_date, end_date or delete on calendar_blocks
  for each row execute function channel_hold_changed();

-- ── Calendar stays no mail has explained ────────────────────────────────────
--
-- One definition, used by the inbox page (to list them) and by the 10-minute
-- health check (to raise each once). A hold is explained when a new-reservation
-- mail from the same channel names its unit — or its unit's listing number or
-- building — and its first night.
--
-- Only counted once that channel's mail is actually reaching the inbox: before
-- the forwarding is live every Airbnb stay would be "missing its email", which
-- is noise. Only `booked` holds: Booking.com's calendar marks everything
-- "CLOSED - Not available", so its reservations cannot be told from an owner
-- closing a date, and are left out rather than guessed at.

create function unexplained_channel_holds(p_min_age interval default interval '1 hour')
returns table (
  id uuid, property_id uuid, start_date date, end_date date,
  source booking_source, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is not null and not is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  return query
  select cb.id, cb.property_id, cb.start_date, cb.end_date, cb.source, cb.created_at
    from calendar_blocks cb
    join properties p on p.id = cb.property_id
   where cb.feed_id is not null
     and cb.booking_id is null
     and cb.block_type = 'booked'
     and cb.end_date >= current_date
     and cb.created_at < now() - p_min_age
     and exists (
       select 1 from ota_messages live
        where live.source = cb.source
          and live.received_at > cb.created_at - interval '14 days'
          and live.received_at < cb.created_at
     )
     and not exists (
       select 1 from ota_messages m
        where m.kind = 'new_booking'
          and m.source = cb.source
          and m.parsed ->> 'check_in' = cb.start_date::text
          and (
            m.property_id = cb.property_id
            or (m.parsed ->> 'listing_id') in (p.airbnb_listing_id, p.booking_hotel_id)
          )
     )
   order by cb.start_date;
end;
$fn$;

revoke execute on function unexplained_channel_holds(interval) from public, anon;
grant execute on function unexplained_channel_holds(interval) to authenticated, service_role;

create or replace function check_channel_health()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_last timestamptz;
  v_sent integer := 0;
  v_n integer;
begin
  select max(f.last_synced_at) into v_last
    from calendar_feeds f
    join properties p on p.id = f.property_id
    join clients c on c.id = p.client_id
   where f.active and c.deactivated_at is null and f.created_at < now() - interval '30 minutes';

  if v_last is not null and v_last < now() - interval '30 minutes' then
    insert into notifications (kind, category, audience, title, body, event_key)
    values ('channel_sync_stopped', 'critical', 'staff',
            'Channel sync has stopped',
            'No Airbnb or Booking.com link has synced since ' ||
              to_char(v_last at time zone 'Asia/Karachi', 'DD Mon HH24:MI') ||
              '. New channel bookings are not reaching the calendar.',
            'sync-stopped:' || extract(epoch from v_last)::bigint)
    on conflict (event_key) where event_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_sent := v_sent + v_n;
  end if;

  insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
  select 'channel_export_unread', 'critical', 'staff',
         'Channels stopped reading ' || p.name || '''s calendar',
         case when e.last_fetched_at is null
              then 'No channel has fetched its export link since it was created'
              else 'Last read ' || to_char(e.last_fetched_at at time zone 'Asia/Karachi', 'DD Mon HH24:MI')
         end || '. Check the link is still pasted into Airbnb / Booking.com.',
         p.client_id, p.id,
         'export-unread:' || e.id || ':' || extract(epoch from coalesce(e.last_fetched_at, e.created_at))::bigint
    from calendar_exports e
    join properties p on p.id = e.property_id
    join clients c on c.id = p.client_id
   where e.active and c.deactivated_at is null
     and coalesce(e.last_fetched_at, e.created_at) < now() - interval '24 hours'
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;
  v_sent := v_sent + v_n;

  -- A channel stay an hour old with no reservation email behind it: either
  -- the forwarding missed it or the owner's account is not forwarding at all.
  insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
  select 'ota_hold_unexplained', 'booking', 'staff',
         case u.source when 'airbnb' then 'Airbnb' when 'booking_com' then 'Booking.com' else 'A channel' end ||
           ' stay on ' || p.name || ' has no email',
         to_char(u.start_date, 'DD Mon') || ' → ' || to_char(u.end_date + 1, 'DD Mon') ||
           ' · no reservation email has arrived for it in an hour. Write it up from the' ||
           ' channel inbox, and check that this listing''s emails are being forwarded.',
         p.client_id, p.id,
         'hold-no-email:' || u.id
    from unexplained_channel_holds(interval '1 hour') u
    join properties p on p.id = u.property_id
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;

  return v_sent + v_n;
end;
$function$;

-- ── Recording a mail ────────────────────────────────────────────────────────
--
-- On top of part 2:
--  - a cancellation or change the code cannot place is matched by guest,
--    dates and unit when exactly one live booking fits (`booking_match`);
--  - a confirmation for a request already booked as tentative is kept open,
--    to confirm that booking rather than add a second;
--  - a newer mail closes the older open ones it overtakes: a cancellation
--    closes the unapproved reservation (and there is then nothing to undo), a
--    confirmation closes its unapproved request.

create or replace function record_ota_message(
  p_provider    text,
  p_message_id  text,
  p_from        text,
  p_to          text,
  p_subject     text,
  p_raw_text    text,
  p_raw_html    text,
  p_source      text,
  p_kind        text,
  p_parsed      jsonb,
  p_parse_error text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_existing   uuid;
  v_listing    text;
  v_listing_id text;
  v_ref        text;
  v_request    boolean := coalesce((p_parsed ->> 'is_request')::boolean, false);
  v_feed_id    uuid;
  v_property   uuid;
  v_client     uuid;
  v_units      int := 0;
  v_booking    uuid;
  v_booking_st text;
  v_match      text;
  v_twin       uuid;
  v_overtaken  int := 0;
  v_status     ota_message_status;
  v_note       text;
  v_kind       ota_message_kind;
  v_source     booking_source;
  v_id         uuid;
  v_title      text;
  v_body       text;
  v_notif_kind text;
  v_category   text;
  v_guest      text;
  v_dates      text;
  v_in         date;
  v_out        date;
begin
  select id into v_existing from ota_messages where message_id = p_message_id;
  if v_existing is not null then
    return jsonb_build_object('status', 'duplicate', 'id', v_existing);
  end if;

  v_kind       := coalesce(nullif(p_kind, ''), 'unknown')::ota_message_kind;
  v_source     := nullif(p_source, '')::booking_source;
  v_listing    := nullif(trim(p_parsed ->> 'listing'), '');
  v_listing_id := nullif(trim(p_parsed ->> 'listing_id'), '');
  v_ref        := nullif(trim(p_parsed ->> 'reservation_code'), '');
  v_in         := nullif(p_parsed ->> 'check_in', '')::date;
  v_out        := nullif(p_parsed ->> 'check_out', '')::date;

  -- The booking this code already belongs to, if any.
  if v_ref is not null and v_source is not null then
    select id, client_id, status into v_booking, v_client, v_booking_st
      from bookings
     where source = v_source and ota_ref = v_ref
     limit 1;
    if v_booking is not null then v_match := 'code'; end if;
  end if;

  -- Which unit, by the channel's own number.
  if v_listing_id is not null and v_source = 'airbnb' then
    select id, client_id into v_property, v_client
      from properties where airbnb_listing_id = v_listing_id;
    v_units := case when v_property is null then 0 else 1 end;
  elsif v_listing_id is not null and v_source = 'booking_com' then
    select count(*)::int, min(client_id::text)::uuid into v_units, v_client
      from properties where booking_hotel_id = v_listing_id;
    if v_units = 1 then
      select id into v_property from properties where booking_hotel_id = v_listing_id;
    end if;
  end if;

  -- A change to a stay entered before codes were kept: the one live booking
  -- from this channel, on these units, with these dates and this guest.
  if v_booking is null and v_kind in ('cancellation', 'alteration') and v_in is not null and v_units > 0 then
    select b.id, b.client_id, b.status into v_booking, v_client, v_booking_st
      from bookings b
     where b.source = v_source
       and b.status <> 'cancelled'
       and b.check_in = v_in
       and (v_out is null or b.check_out = v_out)
       and (nullif(p_parsed ->> 'guest_name', '') is null
            or b.guest_name ilike split_part(p_parsed ->> 'guest_name', ' ', 1) || '%')
       and exists (
         select 1 from booking_properties bp
           join properties p on p.id = bp.property_id
          where bp.booking_id = b.id
            and (bp.property_id = v_property or p.booking_hotel_id = v_listing_id)
       )
       and (select count(distinct b2.id) from bookings b2
              join booking_properties bp2 on bp2.booking_id = b2.id
              join properties p2 on p2.id = bp2.property_id
             where b2.source = v_source and b2.status <> 'cancelled' and b2.check_in = v_in
               and (bp2.property_id = v_property or p2.booking_hotel_id = v_listing_id)) = 1;
    if v_booking is not null then v_match := 'guest_dates'; end if;
  end if;

  -- The unit the named booking is on.
  if v_property is null and v_booking is not null then
    select property_id into v_property
      from booking_properties where booking_id = v_booking
     order by property_id limit 1;
    if v_units = 0 and v_property is not null then v_units := 1; end if;
  end if;

  -- Last resort, for units mapped before listing numbers existed.
  if v_property is null and v_units = 0 and v_listing is not null and v_source is not null then
    select f.property_id, p.client_id into v_property, v_client
      from calendar_feeds f
      join properties p on p.id = f.property_id
     where f.source = v_source
       and coalesce(f.listing_ref, '') <> ''
       and position(lower(f.listing_ref) in lower(v_listing)) > 0
     order by length(f.listing_ref) desc
     limit 1;
    v_units := case when v_property is null then 0 else 1 end;
  end if;

  if v_property is not null then
    select id into v_feed_id
      from calendar_feeds where property_id = v_property and source = v_source
     limit 1;
  end if;

  -- The same reservation, already filed from another inbox. A request and the
  -- confirmation that follows it share a code and a kind, but are not twins.
  if v_ref is not null then
    select id into v_twin
      from ota_messages
     where source is not distinct from v_source
       and external_ref = v_ref
       and kind = v_kind
       and coalesce((parsed ->> 'is_request')::boolean, false) = v_request
     order by received_at
     limit 1;
  end if;

  -- Older open mails this one overtakes.
  if v_ref is not null and v_twin is null and v_kind = 'cancellation' then
    update ota_messages
       set status = 'ignored', reviewed_at = now(),
           admin_note = 'Cancelled by the channel before it was approved.'
     where source is not distinct from v_source and external_ref = v_ref
       and kind in ('new_booking', 'alteration')
       and status in ('pending', 'needs_property', 'failed');
    get diagnostics v_overtaken = row_count;
  elsif v_ref is not null and v_twin is null and v_kind = 'new_booking' and not v_request then
    update ota_messages
       set status = 'ignored', reviewed_at = now(),
           admin_note = 'The channel confirmed this request; see the confirmation.'
     where source is not distinct from v_source and external_ref = v_ref
       and kind = 'new_booking'
       and coalesce((parsed ->> 'is_request')::boolean, false)
       and status in ('pending', 'needs_property', 'failed');
  end if;

  if p_parse_error is not null or v_kind = 'unknown' then
    v_status := 'failed';
  elsif v_twin is not null then
    v_status := 'ignored';
    v_note   := 'The same email arrived twice; this copy was filed under the first.';
  elsif v_kind = 'cancellation' and v_booking is null and v_overtaken > 0 then
    v_status := 'ignored';
    v_note   := 'Cancelled before it was approved — there was no booking to undo.';
  elsif v_kind = 'new_booking' and v_booking is not null
        and not (v_booking_st = 'tentative' and not v_request) then
    v_status := 'ignored';
    v_note   := 'A booking with this confirmation code already exists.';
  elsif v_units > 0 or v_booking is not null then
    v_status := 'pending';
  else
    v_status := 'needs_property';
  end if;

  insert into ota_messages (
    provider, message_id, from_email, to_email, subject,
    raw_text, raw_html, source, kind, status, parse_error, parsed,
    external_ref, feed_id, property_id, booking_id, booking_match, admin_note,
    reviewed_at
  ) values (
    coalesce(p_provider, 'postmark'), p_message_id, p_from, p_to, p_subject,
    p_raw_text, p_raw_html, v_source, v_kind, v_status, p_parse_error, p_parsed,
    v_ref, v_feed_id, v_property, v_booking, v_match, v_note,
    case when v_status = 'ignored' then now() end
  ) returning id into v_id;

  -- Filed away on arrival: nothing for anyone to do, so nobody is told.
  if v_status = 'ignored' then
    return jsonb_build_object('status', v_status, 'id', v_id, 'kind', v_kind, 'note', v_note);
  end if;

  -- ── Tell the admins ───────────────────────────────────────────────────────
  -- Admin-only, every kind. The owner hears nothing yet: a proposal that turns
  -- out to be a mis-parse must not already have told them their flat is sold.
  -- Their notification is the ordinary `booking_created` one, on approval.
  v_guest := coalesce(nullif(trim(p_parsed ->> 'guest_name'), ''), 'A guest');
  v_dates := coalesce(
    nullif(trim(p_parsed ->> 'check_in'), '') ||
      coalesce(' → ' || nullif(trim(p_parsed ->> 'check_out'), ''), ''),
    'dates not in the email'
  );

  if v_status in ('failed', 'needs_property') then
    v_notif_kind := 'ota_email_unmatched';
    v_category   := 'critical';
    v_title      := 'Channel email needs attention';
    v_body       := coalesce(v_listing, p_subject, 'An email') || ' · ' ||
                    case when v_status = 'failed'
                         then 'could not be read automatically'
                         else 'no unit is linked to this listing yet' end ||
                    ' · open the channel inbox.';
  elsif v_kind = 'new_booking' and v_booking is not null then
    v_notif_kind := 'ota_reservation_received';
    v_category   := 'booking';
    v_title      := 'Channel confirmed a request';
    v_body       := v_guest || ' · ' || v_dates || ' · confirm the tentative booking.';
  elsif v_kind = 'new_booking' then
    v_notif_kind := 'ota_reservation_received';
    v_category   := 'booking';
    v_title      := case when v_request then 'New request to book' else 'New channel reservation' end;
    v_body       := v_guest || ' · ' || v_dates ||
                    case when v_property is null
                         then ' · pick the unit, then approve.'
                         else ' · needs review before it counts.' end;
  elsif v_kind = 'cancellation' then
    v_notif_kind := 'ota_reservation_cancelled';
    v_category   := 'critical';
    v_title      := 'Channel reservation cancelled';
    v_body       := v_guest || ' · ' || v_dates ||
                    case when v_booking is null
                         then ' · no matching booking found.'
                         else ' · confirm to reopen the nights.' end;
  elsif v_kind = 'alteration' then
    v_notif_kind := 'ota_reservation_changed';
    v_category   := 'critical';
    v_title      := 'Channel reservation changed';
    v_body       := v_guest || ' · the channel changed this reservation · check the dates and price.';
  else
    v_notif_kind := 'ota_payout_reported';
    v_category   := 'payment';
    v_title      := 'Channel payout email';
    v_body       := coalesce(v_listing, 'A listing') ||
                    ' · nothing has been settled — review it in the channel inbox.';
  end if;

  insert into notifications (
    kind, category, audience, title, body, client_id, property_id, booking_id, event_key
  ) values (
    v_notif_kind, v_category, 'admin', v_title, v_body,
    v_client, v_property, v_booking, 'ota_message:' || p_message_id
  )
  on conflict (event_key) where event_key is not null do nothing;

  return jsonb_build_object(
    'status', v_status, 'id', v_id, 'kind', v_kind,
    'property_id', v_property, 'booking_id', v_booking, 'units', v_units, 'match', v_match
  );
end;
$fn$;

revoke execute on function link_channel_hold_to_booking() from public, anon, authenticated;
revoke execute on function channel_hold_changed() from public, anon, authenticated;
