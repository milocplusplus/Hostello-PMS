-- ── Channel ids on units, and routing channel mail by them ──────────────────
--
-- A listing's *title* is the channel's marketing copy: it changes, and two
-- flats can share most of one. Its *number* does not. Real mails (see
-- `supabase/functions/ota-email/fixtures/`) carry Airbnb's listing number and
-- Booking.com's `hotel_id`, so those are what a mail is routed by now.
--
-- Booking.com is the awkward one. Its `hotel_id` is a building, not a flat,
-- and several identical flats can be sold as one room type with one shared
-- availability count. Neither the mail nor the calendar says which flat a
-- guest got — Hostello decides that when approving. The owner chose to keep
-- those shared types (2026-09-28), so `booking_room_type` groups them, and
-- because Booking.com cannot be told about a flat it does not know exists,
-- staff are reminded to move its availability count by hand.

alter table properties
  add column airbnb_listing_id text,
  add column booking_hotel_id  text,
  add column booking_room_type text;

comment on column properties.airbnb_listing_id is
  'Airbnb listing number (airbnb.com/rooms/<n>). One listing is one unit.';
comment on column properties.booking_hotel_id is
  'Booking.com property id (hotel_id). A building: many units may share it.';
comment on column properties.booking_room_type is
  'Booking.com room type this unit is sold under when several units share one. Null = its own room type.';

create unique index properties_airbnb_listing_id_key
  on properties (airbnb_listing_id) where airbnb_listing_id is not null;
create index properties_booking_hotel_id_idx
  on properties (booking_hotel_id) where booking_hotel_id is not null;

-- Staff read units through the view (ops has no policy on the base table).
-- New columns go on the end, which is all `create or replace` allows.
create or replace view properties_v with (security_invoker = false) as
 SELECT id,
    client_id,
    name,
    location,
    city,
    type,
    status,
    created_at,
    province,
        CASE
            WHEN NOT is_ops() THEN stack_rate
            ELSE NULL::numeric
        END AS stack_rate,
        CASE
            WHEN NOT is_ops() THEN short_stay_stack_rate
            ELSE NULL::numeric
        END AS short_stay_stack_rate,
    max_guests,
    nightly_rate,
    short_stay_rate,
    photo_path,
    status = 'active'::property_status AND NOT (EXISTS ( SELECT 1
           FROM clients d
          WHERE d.id = p.client_id AND d.deactivated_at IS NOT NULL)) AS bookable,
    airbnb_listing_id,
    booking_hotel_id,
    booking_room_type
   FROM properties p
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE c.id = p.client_id AND c.owner_user_id = auth.uid()));

-- ── Recording a mail ────────────────────────────────────────────────────────
--
-- Same signature and same division of labour as before: the edge function
-- parses, this decides. What changed:
--  - routing by listing number / hotel_id, falling back to the booking the
--    code names, and last to the old title fragment on `calendar_feeds`;
--  - a Booking.com building with several units is routable (`pending`) with
--    no unit yet — the reviewer picks one;
--  - the same reservation mailed twice (owner forwarding *and* Hostello as
--    co-host) files the second copy as `ignored` and raises nothing;
--  - a new-booking mail whose code is already on a booking does the same.

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
  v_feed_id    uuid;
  v_property   uuid;
  v_client     uuid;
  v_units      int := 0;
  v_booking    uuid;
  v_twin       uuid;
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

  -- The booking this code already belongs to, if any.
  if v_ref is not null and v_source is not null then
    select id, client_id into v_booking, v_client
      from bookings
     where source = v_source and ota_ref = v_ref
     limit 1;
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

  -- The unit the named booking is on.
  if v_property is null and v_units = 0 and v_booking is not null then
    select property_id into v_property
      from booking_properties where booking_id = v_booking
     order by property_id limit 1;
    v_units := case when v_property is null then 0 else 1 end;
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

  -- The same reservation, already filed from another inbox.
  if v_ref is not null then
    select id into v_twin
      from ota_messages
     where source is not distinct from v_source
       and external_ref = v_ref
       and kind = v_kind
     order by received_at
     limit 1;
  end if;

  if p_parse_error is not null or v_kind = 'unknown' then
    v_status := 'failed';
  elsif v_twin is not null then
    v_status := 'ignored';
    v_note   := 'The same email arrived twice; this copy was filed under the first.';
  elsif v_kind = 'new_booking' and v_booking is not null then
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
    external_ref, feed_id, property_id, booking_id, admin_note,
    reviewed_at
  ) values (
    coalesce(p_provider, 'postmark'), p_message_id, p_from, p_to, p_subject,
    p_raw_text, p_raw_html, v_source, v_kind, v_status, p_parse_error, p_parsed,
    v_ref, v_feed_id, v_property, v_booking, v_note,
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
  elsif v_kind = 'new_booking' then
    v_notif_kind := 'ota_reservation_received';
    v_category   := 'booking';
    v_title      := 'New channel reservation';
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
    'property_id', v_property, 'booking_id', v_booking, 'units', v_units
  );
end;
$fn$;

-- ── Moving Booking.com's count for a shared room type ───────────────────────
--
-- A flat in a shared room type is invisible to Booking.com as a flat: it sells
-- "one Deluxe Studio" from a count. When Hostello fills or frees one of those
-- flats through any other channel, that count is wrong until someone changes
-- it on the extranet. Nothing can change it for us, so staff are told.
--
-- A trigger rather than a call in each write path, because a stay reaches a
-- unit through six of them (both portals, the calendar, the inbox, bulk
-- status, unit moves). Skipped for Booking.com's own reservations: it already
-- counted those.

create function notify_booking_com_count(
  p_booking   uuid,
  p_property  uuid,
  p_check_in  date,
  p_check_out date,   -- exclusive
  p_direction text    -- 'lower' | 'raise'
) returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type   text;
  v_client uuid;
  v_unit   text;
  v_nights text;
begin
  select booking_room_type, client_id, name
    into v_type, v_client, v_unit
    from properties where id = p_property;

  if v_type is null or p_check_in is null or p_check_out is null then
    return;
  end if;

  v_nights := to_char(p_check_in, 'DD Mon') ||
              case when p_check_out - p_check_in > 1
                   then ' – ' || to_char(p_check_out - 1, 'DD Mon') else '' end;

  insert into notifications (
    kind, category, audience, title, body, client_id, property_id, booking_id, event_key
  ) values (
    'booking_com_count', 'calendar', 'staff',
    case when p_direction = 'lower'
         then 'Lower ' || v_type || ' on Booking.com'
         else 'Raise ' || v_type || ' on Booking.com' end,
    v_unit || ' is now ' ||
      case when p_direction = 'lower' then 'taken' else 'free' end ||
      ' for the night' || case when p_check_out - p_check_in > 1 then 's of ' else ' of ' end ||
      v_nights || '. ' ||
      case when p_direction = 'lower'
           then 'Take one ' || v_type || ' off Booking.com''s availability for those nights.'
           else 'Add one ' || v_type || ' back to Booking.com''s availability for those nights.' end,
    v_client, p_property, p_booking,
    -- One per change: the same row touched twice in one transaction says it once.
    'bc-count:' || p_direction || ':' || p_booking || ':' || p_property || ':' ||
      p_check_in || ':' || p_check_out || ':' || txid_current()
  )
  on conflict (event_key) where event_key is not null do nothing;
end;
$fn$;

create function booking_com_count_on_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row  booking_properties;
  v_book record;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;

  select id, check_in, check_out, status, source into v_book
    from bookings where id = v_row.booking_id;

  -- Gone (a delete cascading), cancelled, or Booking.com's own: nothing moved.
  if not found or v_book.status = 'cancelled' or v_book.source = 'booking_com' then
    return null;
  end if;

  perform notify_booking_com_count(
    v_book.id, v_row.property_id, v_book.check_in, v_book.check_out,
    case when tg_op = 'INSERT' then 'lower' else 'raise' end
  );
  return null;
end;
$fn$;

create function booking_com_count_on_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_unit uuid;
  v_was  boolean := old.status <> 'cancelled';
  v_is   boolean := new.status <> 'cancelled';
begin
  if new.source = 'booking_com' then
    return null;
  end if;

  if v_was = v_is and (not v_is or (old.check_in = new.check_in and old.check_out = new.check_out)) then
    return null;
  end if;

  for v_unit in select property_id from booking_properties where booking_id = new.id loop
    if v_was then
      perform notify_booking_com_count(new.id, v_unit, old.check_in, old.check_out, 'raise');
    end if;
    if v_is then
      perform notify_booking_com_count(new.id, v_unit, new.check_in, new.check_out, 'lower');
    end if;
  end loop;

  return null;
end;
$fn$;

create trigger booking_properties_booking_com_count
  after insert or delete on booking_properties
  for each row execute function booking_com_count_on_link();

create trigger bookings_booking_com_count
  after update of status, check_in, check_out on bookings
  for each row execute function booking_com_count_on_booking();

-- Nobody calls these directly; the triggers run as their owner.
revoke execute on function notify_booking_com_count(uuid, uuid, date, date, text) from public, anon, authenticated;
revoke execute on function booking_com_count_on_link() from public, anon, authenticated;
revoke execute on function booking_com_count_on_booking() from public, anon, authenticated;
