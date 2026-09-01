-- ── Channel reservation email intake ────────────────────────────────────────
--
-- iCal carries dates and nothing else, so the guest's name and the money have
-- to come from somewhere else. They come from the confirmation mail the channel
-- already sends the host: forwarded into an inbound-email service and posted
-- here by the `ota-email` edge function.
--
-- **Nothing in this file computes a payout.** A parsed message is a *proposal*.
-- It becomes a booking only when an admin approves it in the app, where
-- `src/lib/payout.ts` — the one revenue math — runs. That is deliberate: a
-- second copy of the split living in SQL is exactly what `ical_export_document()`
-- already cost us once, and this one would be the split itself.

create type ota_message_kind as enum (
  'new_booking', 'cancellation', 'alteration', 'payout', 'unknown'
);

create type ota_message_status as enum (
  'pending',        -- parsed and matched to a property: waiting for an admin
  'needs_property', -- parsed, but no connected feed claims this listing
  'applied',        -- an admin turned it into / applied it to a booking
  'ignored',        -- an admin dismissed it
  'failed'          -- could not be read at all; the raw mail is kept for replay
);

-- Which listing on a channel this feed is. Matched as a case-insensitive
-- *fragment* of the listing title in the email, so an admin can paste the
-- distinctive part ("Gulberg Loft") instead of Airbnb's whole marketing
-- headline, which they do not control and which changes.
alter table calendar_feeds add column listing_ref text;

comment on column calendar_feeds.listing_ref is
  'Fragment of the channel listing title used to route inbound reservation emails to this property.';

-- The channel's own confirmation code. This is how a later cancellation or
-- alteration mail finds the booking its first mail created.
alter table bookings add column ota_ref text;

create unique index bookings_source_ota_ref_key
  on bookings (source, ota_ref) where ota_ref is not null;

create table ota_messages (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'postmark',
  -- The provider's own id. Unique, so a webhook retry is a no-op rather than a
  -- second booking — the same job `event_key` does for notifications.
  message_id    text not null unique,
  from_email    text,
  to_email      text,
  subject       text,
  received_at   timestamptz not null default now(),
  -- Kept verbatim and forever. When a channel restyles its mail the parser will
  -- be wrong, and the only way to fix the rows it got wrong is to run the new
  -- parser over the old bytes.
  raw_text      text,
  raw_html      text,
  source        booking_source,
  kind          ota_message_kind not null default 'unknown',
  status        ota_message_status not null default 'failed',
  parse_error   text,
  -- guest_name, guest_phone, check_in, check_out, guests, currency,
  -- gross, host_payout, listing, reservation_code — whatever the parser found.
  parsed        jsonb,
  external_ref  text,
  feed_id       uuid references calendar_feeds(id) on delete set null,
  property_id   uuid references properties(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,
  reviewed_by   uuid references profiles(id),
  reviewed_at   timestamptz,
  admin_note    text,
  created_at    timestamptz not null default now()
);

create index ota_messages_status_idx on ota_messages (status, received_at desc);
create index ota_messages_external_ref_idx on ota_messages (source, external_ref)
  where external_ref is not null;

alter table ota_messages enable row level security;

-- Admins only, and no insert path through the API at all. A raw channel email
-- carries the guest's details and the channel's own figures; an owner has no
-- business in another owner's mail, and nothing outside `record_ota_message`
-- may write here.
create policy ota_messages_admin_read on ota_messages
  for select to authenticated using (is_admin());

create policy ota_messages_admin_review on ota_messages
  for update to authenticated using (is_admin()) with check (is_admin());

-- ── The inbound door ────────────────────────────────────────────────────────

-- Same shape as `is_ical_sync_secret`: the shared secret lives in Vault, never
-- in a table and never in the repo.
create function is_ota_inbound_secret(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $fn$
  select exists (
    select 1 from vault.decrypted_secrets
     where name = 'ota_inbound_secret'
       and decrypted_secret = p_secret
  );
$fn$;

-- Record one inbound channel email.
--
-- The edge function fetches and parses; the *rules* live here, next to the data
-- — which listing belongs to which property, what counts as reviewable, and
-- what the admins get told. Exactly the division `sync_calendar_feed_apply()`
-- already uses.
--
-- It writes its notification by inserting into `notifications` directly rather
-- than through `emit_notification`, because there is no `auth.uid()` on this
-- path — the same reason `notify_daily_stays()` does.
create function record_ota_message(
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
  v_ref        text;
  v_feed_id    uuid;
  v_property   uuid;
  v_client     uuid;
  v_booking    uuid;
  v_status     ota_message_status;
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

  v_kind    := coalesce(nullif(p_kind, ''), 'unknown')::ota_message_kind;
  v_source  := nullif(p_source, '')::booking_source;
  v_listing := nullif(trim(p_parsed ->> 'listing'), '');
  v_ref     := nullif(trim(p_parsed ->> 'reservation_code'), '');

  -- Route to a property through the feed that already ties this channel to it.
  -- A fragment match, not equality: the admin owns `listing_ref`, the channel
  -- owns the title in the mail and rewrites it whenever it likes.
  if v_listing is not null and v_source is not null then
    select f.id, f.property_id, p.client_id
      into v_feed_id, v_property, v_client
      from calendar_feeds f
      join properties p on p.id = f.property_id
     where f.source = v_source
       and f.listing_ref is not null
       and f.listing_ref <> ''
       and position(lower(f.listing_ref) in lower(v_listing)) > 0
     order by length(f.listing_ref) desc   -- the most specific ref wins
     limit 1;
  end if;

  -- A cancellation or an alteration is about a booking we should already hold.
  if v_ref is not null and v_source is not null then
    select id into v_booking
      from bookings
     where source = v_source and ota_ref = v_ref
     limit 1;
  end if;

  if p_parse_error is not null or v_kind = 'unknown' then
    v_status := 'failed';
  elsif v_feed_id is null then
    v_status := 'needs_property';
  else
    v_status := 'pending';
  end if;

  insert into ota_messages (
    provider, message_id, from_email, to_email, subject,
    raw_text, raw_html, source, kind, status, parse_error, parsed,
    external_ref, feed_id, property_id, booking_id
  ) values (
    coalesce(p_provider, 'postmark'), p_message_id, p_from, p_to, p_subject,
    p_raw_text, p_raw_html, v_source, v_kind, v_status, p_parse_error, p_parsed,
    v_ref, v_feed_id, v_property, v_booking
  ) returning id into v_id;

  -- ── Tell the admins ───────────────────────────────────────────────────────
  -- Admin-only, every kind. The owner hears nothing yet: a proposal that turns
  -- out to be a mis-parse must not already have told them their flat is sold.
  -- Their notification is the ordinary `booking_created` one, on approval.
  v_guest := coalesce(nullif(trim(p_parsed ->> 'guest_name'), ''), 'A guest');
  v_dates := coalesce(
    nullif(trim(p_parsed ->> 'check_in'), '') ||
      coalesce(' → ' || nullif(trim(p_parsed ->> 'check_out'), ''), ''),
    'dates unread'
  );

  if v_status in ('failed', 'needs_property') then
    v_notif_kind := 'ota_email_unmatched';
    v_category   := 'critical';
    v_title      := 'Channel email needs attention';
    v_body       := coalesce(v_listing, p_subject, 'An email') || ' · ' ||
                    case when v_status = 'failed'
                         then 'could not be read automatically'
                         else 'no property is mapped to this listing' end ||
                    ' · open the channel inbox.';
  elsif v_kind = 'new_booking' then
    v_notif_kind := 'ota_reservation_received';
    v_category   := 'booking';
    v_title      := 'New channel reservation';
    v_body       := v_guest || ' · ' || v_dates || ' · needs review before it counts.';
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
    v_body       := v_guest || ' · now ' || v_dates || ' · the payout has to be recalculated.';
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
    'property_id', v_property, 'booking_id', v_booking
  );
end;
$fn$;

-- A fresh function keeps its default PUBLIC grant, which anon inherits.
revoke execute on function is_ota_inbound_secret(text) from public, anon, authenticated;
revoke execute on function record_ota_message(
  text, text, text, text, text, text, text, text, text, jsonb, text
) from public, anon, authenticated;

grant execute on function is_ota_inbound_secret(text) to service_role;
grant execute on function record_ota_message(
  text, text, text, text, text, text, text, text, text, jsonb, text
) to service_role;
