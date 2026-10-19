-- Host mode: a host forwards their Airbnb emails to Hostello's inbox and the booking,
-- the cancellation and the date change are applied by themselves. A host keeps every
-- rupee, so this is the 0%-share case of payout.ts written out: net = sale price,
-- Hostello share 0, owner payout = sale price, nothing owed either way (checked
-- against calculatePayout for confirmed and tentative stays).
-- Applied to the live DB as `host_airbnb_emails`, `host_airbnb_emails_status_cast` and
-- `host_airbnb_emails_alteration_twin` on 2026-10-19; this file holds the final state.

-- ── Where a host's mail is recognised ───────────────────────────────────────────
alter table public.clients add column channel_email text;
create unique index clients_channel_email_key on public.clients (channel_email) where channel_email is not null;

alter table public.ota_messages add column client_id uuid references public.clients(id) on delete cascade;

create policy "hosts stay out of staff screens (by client)" on public.ota_messages
  as restrictive for all to authenticated
  using (public.staff_may_see_client(client_id)) with check (public.staff_may_see_client(client_id));
create policy "ota_messages: host reads own" on public.ota_messages
  for select to authenticated using (public.owns_host_client(client_id));

-- Rupees per one unit of a foreign currency, filled daily by the `fx-rates` function.
create table public.fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  pkr_per_unit numeric not null check (pkr_per_unit > 0),
  as_of date not null,
  fetched_at timestamptz not null default now()
);
alter table public.fx_rates enable row level security;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fx_rates_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'fx_rates_secret');
  end if;
end $$;
create or replace function public.is_fx_rates_secret(p_secret text) returns boolean
language sql security definer set search_path = public, vault, pg_temp as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'fx_rates_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.is_fx_rates_secret(text) from public, anon, authenticated;
grant execute on function public.is_fx_rates_secret(text) to service_role;

create or replace function public.save_fx_rates(p_rates jsonb, p_as_of date) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into fx_rates (currency, pkr_per_unit, as_of, fetched_at)
  select key, value::numeric, p_as_of, now() from jsonb_each_text(p_rates)
  where key ~ '^[A-Z]{3}$' and value::numeric > 0
  on conflict (currency) do update set pkr_per_unit = excluded.pkr_per_unit, as_of = excluded.as_of, fetched_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.save_fx_rates(jsonb, date) from public, anon, authenticated;
grant execute on function public.save_fx_rates(jsonb, date) to service_role;

create or replace function public.run_fx_rates_refresh() returns bigint
language plpgsql security definer set search_path = public, extensions, vault, pg_temp as $$
declare v_secret text; v_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'fx_rates_secret';
  select net.http_post(
    url := 'https://vucfpfqcankyztzvmyht.supabase.co/functions/v1/fx-rates',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Fx-Secret', v_secret),
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.run_fx_rates_refresh() from public, anon, authenticated;
select cron.schedule('hostello-fx-rates', '10 4 * * *', 'select public.run_fx_rates_refresh();');

-- ── The host's own controls ─────────────────────────────────────────────────────
create or replace function public.set_host_channel_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(coalesce(p_email, '')));
begin
  if v <> '' and v !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'That does not look like an email address.';
  end if;
  update clients set channel_email = nullif(v, '')
  where owner_user_id = auth.uid() and account_type = 'host';
  if not found then raise exception 'This is for self-serve accounts.'; end if;
exception when unique_violation then
  raise exception 'That email is already used by another account.';
end $$;
revoke execute on function public.set_host_channel_email(text) from public, anon;
grant execute on function public.set_host_channel_email(text) to authenticated;

create or replace function public.host_dismiss_ota_message(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update ota_messages
     set status = 'ignored', reviewed_at = now(), admin_note = 'Dismissed by you.'
   where id = p_id and owns_host_client(client_id) and status in ('pending', 'needs_property', 'failed');
$$;
revoke execute on function public.host_dismiss_ota_message(uuid) from public, anon;
grant execute on function public.host_dismiss_ota_message(uuid) to authenticated;

-- ── Applying an email to a host's bookings ──────────────────────────────────────
create or replace function public.host_ota_hold(p_id uuid, p_code text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update ota_messages set admin_note = p_text where id = p_id;
  return jsonb_build_object('applied', false, 'reason', p_code);
end $$;
revoke execute on function public.host_ota_hold(uuid, text, text) from public, anon, authenticated;

create or replace function public.host_ota_apply(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m ota_messages%rowtype;
  c clients%rowtype;
  b bookings%rowtype;
  v_sub text;
  v_addr text;
  v_in date;
  v_out date;
  v_cur text;
  v_amt numeric;
  v_rate numeric;
  v_rate_on date;
  v_price numeric;
  v_request boolean;
  v_booking uuid;
  v_unit text;
  v_arrive time;
  v_depart time;
  v_guest text;
  v_clash boolean;
  v_dates text;
  v_exclude uuid;
begin
  select * into m from ota_messages where id = p_id and status = 'pending';
  if not found then return jsonb_build_object('applied', false, 'reason', 'not_pending'); end if;

  select * into c from clients where id = m.client_id and account_type = 'host';
  if not found then return jsonb_build_object('applied', false, 'reason', 'not_host'); end if;

  select status into v_sub from subscriptions where client_id = c.id;
  if v_sub is null or v_sub in ('read_only', 'paused') then
    return host_ota_hold(p_id, 'locked', 'Your account is read-only, so nothing was added automatically.');
  end if;

  -- Only mail addressed to the Airbnb account the host registered is trusted.
  v_addr := lower(substring(coalesce(m.to_email, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'));
  if c.channel_email is null or v_addr is distinct from c.channel_email then
    return host_ota_hold(p_id, 'address',
      'This email was not addressed to the Airbnb email saved on your account, so it was not added automatically.');
  end if;

  v_in := nullif(m.parsed ->> 'check_in', '')::date;
  v_out := nullif(m.parsed ->> 'check_out', '')::date;
  v_request := coalesce((m.parsed ->> 'is_request')::boolean, false);
  v_guest := nullif(trim(m.parsed ->> 'guest_name'), '');

  -- The price, in rupees: the host's payout if the email gives it, else the total.
  v_cur := upper(nullif(trim(m.parsed ->> 'currency'), ''));
  v_amt := coalesce(nullif(m.parsed ->> 'host_payout', '')::numeric, nullif(m.parsed ->> 'gross', '')::numeric);
  if v_amt is not null and v_amt > 0 then
    if v_cur is null or v_cur = 'PKR' then
      v_price := round(v_amt);
    else
      select pkr_per_unit, as_of into v_rate, v_rate_on from fx_rates
       where currency = v_cur and as_of >= current_date - 3;
      if v_rate is not null then v_price := round(v_amt * v_rate); end if;
    end if;
  end if;

  -- ── A new reservation ──
  if m.kind = 'new_booking' then
    if m.property_id is null or not exists (select 1 from properties where id = m.property_id and client_id = c.id) then
      return host_ota_hold(p_id, 'property', 'No property of yours is linked to this Airbnb listing.');
    end if;
    select name into v_unit from properties where id = m.property_id;

    -- Airbnb accepted a request that is already here as a tentative booking.
    if m.booking_id is not null then
      select * into b from bookings where id = m.booking_id and client_id = c.id;
      if not found then return host_ota_hold(p_id, 'no_booking', 'No booking with this confirmation code was found.'); end if;
      update bookings set status = 'confirmed' where id = b.id and status = 'tentative';
      insert into notifications (kind, category, audience, title, body, client_id, booking_id, event_key)
      values ('booking_updated', 'booking', 'client', 'Booking confirmed',
              v_unit || ' · ' || to_char(b.check_in, 'DD Mon') || ' → ' || to_char(b.check_out, 'DD Mon') || ' · Airbnb confirmed the request',
              c.id, b.id, 'booking_updated:client:' || b.id || ':confirm')
      on conflict (event_key) where event_key is not null do nothing;
      update ota_messages set status = 'applied', reviewed_at = now(), admin_note = 'Applied automatically.' where id = p_id;
      return jsonb_build_object('applied', true, 'booking_id', b.id);
    end if;

    if v_in is null or v_out is null or v_out <= v_in then
      return host_ota_hold(p_id, 'dates', 'The dates could not be read from the email.');
    end if;
    if v_amt is null or v_amt <= 0 then
      return host_ota_hold(p_id, 'price', 'The price could not be read from the email.');
    end if;
    if v_price is null then
      return host_ota_hold(p_id, 'currency', 'The price is in ' || v_cur || ' and no exchange rate is available yet.');
    end if;

    -- Nights already taken, apart from the channel's own hold for exactly this stay.
    select exists (
      select 1 from booking_properties bp join bookings x on x.id = bp.booking_id
       where bp.property_id = m.property_id and x.status <> 'cancelled'
         and x.check_in < v_out and x.check_out > v_in
    ) or exists (
      select 1 from calendar_blocks cb
       where cb.property_id = m.property_id and cb.start_date < v_out and cb.end_date >= v_in
         and cb.booking_id is null
         and not (cb.feed_id is not null and cb.block_type = 'booked' and cb.source = 'airbnb'
                  and cb.start_date = v_in and cb.end_date = v_out - 1)
    ) into v_clash;
    if v_clash then
      return host_ota_hold(p_id, 'clash', 'These nights overlap another booking or blocked dates on ' || v_unit || '. Check the calendar.');
    end if;

    select checkin_time::time, checkout_time::time into v_arrive, v_depart from app_settings limit 1;

    insert into bookings (
      client_id, guest_name, check_in, check_out, is_short_stay, source, status,
      sale_price, advance_received, advance_received_by,
      deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot,
      ota_model_snapshot, ota_share_percent_snapshot, stack_rate_snapshot,
      net_sale, hostello_share, client_payout, due_to_client, due_to_hostello,
      guests_count, expected_arrival, expected_departure, notes, ota_ref,
      original_currency, original_amount, fx_rate, fx_rate_on, fx_provisional
    ) values (
      c.id, v_guest, v_in, v_out, false, 'airbnb', (case when v_request then 'tentative' else 'confirmed' end)::booking_status,
      v_price, v_price, 'owner',
      c.deal_model, c.share_percent, c.deduct_percent,
      c.ota_model, c.ota_share_percent, 0,
      v_price, 0, v_price, 0, 0,
      nullif(m.parsed ->> 'guests', '')::int, v_arrive, v_depart, 'Added automatically from the Airbnb email.', m.external_ref,
      case when v_rate is not null then v_cur end,
      case when v_rate is not null then v_amt end,
      case when v_rate is not null then round(v_price / v_amt, 4) end,
      case when v_rate is not null then v_rate_on end,
      case when v_rate is not null then v_in > current_date else false end
    ) returning id into v_booking;

    insert into booking_properties (booking_id, property_id) values (v_booking, m.property_id);

    -- The channel's calendar hold for this stay now belongs to the booking.
    update calendar_blocks set booking_id = v_booking
     where property_id = m.property_id and feed_id is not null and booking_id is null
       and block_type = 'booked' and source = 'airbnb'
       and start_date = v_in and end_date = v_out - 1;

    v_dates := to_char(v_in, 'DD Mon') || ' → ' || to_char(v_out, 'DD Mon');
    insert into notifications (kind, category, audience, title, body, client_id, booking_id, event_key)
    values ('booking_created', 'booking', 'client',
            case when v_request then 'Tentative booking held' else 'New booking' end,
            v_unit || ' · ' || v_dates || ' · Airbnb · added from the email',
            c.id, v_booking, 'booking_created:client:' || v_booking)
    on conflict (event_key) where event_key is not null do nothing;

    update ota_messages set status = 'applied', booking_id = v_booking, reviewed_at = now(),
           admin_note = 'Added automatically.' where id = p_id;
    return jsonb_build_object('applied', true, 'booking_id', v_booking);
  end if;

  -- ── A cancellation or a change: it has to be one of this host's bookings ──
  if m.kind in ('cancellation', 'alteration') then
    select * into b from bookings where id = m.booking_id and client_id = c.id;
    if not found then
      return host_ota_hold(p_id, 'no_booking', 'No booking with this confirmation code was found.');
    end if;
    select p.name into v_unit from booking_properties bp join properties p on p.id = bp.property_id
     where bp.booking_id = b.id order by p.name limit 1;

    if m.kind = 'cancellation' then
      if b.status <> 'cancelled' then
        update bookings set status = 'cancelled' where id = b.id;
        insert into notifications (kind, category, audience, title, body, client_id, booking_id, event_key)
        values ('booking_cancelled', 'booking', 'client', 'Booking cancelled',
                coalesce(v_unit, 'Your property') || ' · ' || to_char(b.check_in, 'DD Mon') || ' → ' || to_char(b.check_out, 'DD Mon')
                  || ' · Airbnb · cancelled by the guest',
                c.id, b.id, 'booking_cancelled:client:' || b.id)
        on conflict (event_key) where event_key is not null do nothing;
      end if;
      update ota_messages set status = 'applied', reviewed_at = now(), admin_note = 'Cancelled automatically.' where id = p_id;
      return jsonb_build_object('applied', true, 'booking_id', b.id);
    end if;

    -- A change. Airbnb's "updated" mail often carries no dates; then it is the host's to check.
    if v_in is null or v_out is null or v_out <= v_in then
      return host_ota_hold(p_id, 'alteration_dates',
        'Airbnb changed this reservation but did not say how. Check the dates against Airbnb.');
    end if;
    v_exclude := b.id;
    select exists (
      select 1 from booking_properties bp join bookings x on x.id = bp.booking_id
       where bp.property_id in (select property_id from booking_properties where booking_id = b.id)
         and x.id <> b.id and x.status <> 'cancelled' and x.check_in < v_out and x.check_out > v_in
    ) or exists (
      select 1 from calendar_blocks cb
       where cb.property_id in (select property_id from booking_properties where booking_id = b.id)
         and cb.start_date < v_out and cb.end_date >= v_in
         and cb.booking_id is distinct from v_exclude
         and cb.booking_id is null
         and not (cb.feed_id is not null and cb.block_type = 'booked' and cb.source = 'airbnb'
                  and cb.start_date = v_in and cb.end_date = v_out - 1)
    ) into v_clash;
    if v_clash then
      return host_ota_hold(p_id, 'clash', 'The new dates overlap another booking or blocked dates. Check the calendar.');
    end if;

    update bookings set check_in = v_in, check_out = v_out where id = b.id;
    if v_price is not null then
      update bookings set sale_price = v_price, net_sale = v_price, client_payout = v_price, advance_received = v_price,
             original_currency = case when v_rate is not null then v_cur end,
             original_amount = case when v_rate is not null then v_amt end,
             fx_rate = case when v_rate is not null then round(v_price / v_amt, 4) end,
             fx_rate_on = case when v_rate is not null then v_rate_on end
       where id = b.id;
    end if;
    insert into notifications (kind, category, audience, title, body, client_id, booking_id, event_key)
    values ('booking_updated', 'booking', 'client', 'Booking updated',
            coalesce(v_unit, 'Your property') || ' · ' || to_char(v_in, 'DD Mon') || ' → ' || to_char(v_out, 'DD Mon')
              || ' · Airbnb · changed by Airbnb',
            c.id, b.id, 'booking_updated:client:' || b.id || ':' || p_id)
    on conflict (event_key) where event_key is not null do nothing;
    update ota_messages set status = 'applied', reviewed_at = now(), admin_note = 'Changed automatically.' where id = p_id;
    return jsonb_build_object('applied', true, 'booking_id', b.id);
  end if;

  return host_ota_hold(p_id, 'unsupported', 'This kind of email is not added automatically.');
end $$;
revoke execute on function public.host_ota_apply(uuid) from public, anon, authenticated;

-- ── The intake ──────────────────────────────────────────────────────────────────
-- record_ota_message() is the long function from the channel inbox, with these changes
-- (the live definition is the reference):
--   * new variables v_host, v_to_addr, v_apply
--   * after the unit and feed are resolved: decide whose mail it is — a host's, by the
--     unit or booking it names (clients.account_type = 'host'), else by the Airbnb
--     address it was sent to (clients.channel_email), else, for Gmail's forwarding
--     confirmation, by the address named in its text
--   * a host's payout mail is filed as ignored
--   * for a host, a repeated "alteration" is not a twin (Airbnb sends several)
--   * ota_messages.client_id is written, and for a host's mail, instead of notifying
--     staff: host_ota_apply(id) runs; if it does not apply, the host gets a
--     `host_email_attention` notice with the reason (ota_messages.admin_note)

-- A host hears about a stay the calendar moved or dropped, as staff do for managed clients.
do $$
declare
  v_def text := pg_get_functiondef('public.fan_out_notification()'::regprocedure);
  v_old text := 'new.kind in (''channel_reservation'', ''calendar_conflict'')';
  v_new text := 'new.kind in (''channel_reservation'', ''calendar_conflict'', ''channel_stay_moved'', ''channel_stay_dropped'')';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'fan_out_notification no longer has the expected host kinds';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
