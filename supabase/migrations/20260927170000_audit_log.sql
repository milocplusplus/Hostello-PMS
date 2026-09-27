-- Audit log: who changed what, and when.
--
-- Written by triggers, not by the app, so every path lands here the same way:
-- Server Actions, the SECURITY DEFINER RPCs, the channel sync and the cron
-- jobs. The actor is `auth.uid()`; with no session (cron, the sync's secret)
-- it is "System". Admin reads it; nobody — the admin included — may write,
-- change or delete a row: there is no policy and no grant for it.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- Groups one action's rows: a client delete and the units, stays and
  -- blocks it cascaded away share a tx.
  tx bigint not null default txid_current(),
  actor_id uuid,
  actor_name text,
  -- admin | ops | client | system
  actor_role text not null,
  -- booking | money | client | staff | signin
  category text not null,
  -- insert | update | delete | login_created | login_deleted | sign_in |
  -- sign_in_failed | password_changed | email_changed | access_removed | access_restored
  action text not null,
  table_name text,
  record_id text,
  -- What the row is, in words, as it was at the time: a guest, a unit, a client.
  label text,
  client_id uuid,
  property_id uuid,
  booking_id uuid,
  -- update: { column: [before, after] } for the columns that changed.
  changes jsonb,
  -- insert: the new row; delete: the row as it was.
  snapshot jsonb,
  -- Deleted because something it belonged to was deleted, not on its own.
  cascaded boolean not null default false
);

create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_client_idx on public.audit_log (client_id, at desc) where client_id is not null;
create index audit_log_property_idx on public.audit_log (property_id, at desc) where property_id is not null;
create index audit_log_booking_idx on public.audit_log (booking_id, at desc) where booking_id is not null;
create index audit_log_actor_idx on public.audit_log (actor_id, at desc) where actor_id is not null;
create index audit_log_tx_idx on public.audit_log (tx);
create index audit_log_signin_fail_idx on public.audit_log (label, at) where action = 'sign_in_failed';

alter table public.audit_log enable row level security;

create policy audit_log_admin_read on public.audit_log
  for select to authenticated using ((select public.is_admin()));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ── Who is acting ───────────────────────────────────────────────────────────

create or replace function public.audit_actor(p_uid uuid, out actor_id uuid, out actor_name text, out actor_role text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p_uid,
         coalesce(p.full_name, c.name, u.email::text),
         coalesce(p.role::text, case when p_uid is null then 'system' else 'unknown' end)
  from (select 1) one
  left join public.profiles p on p.id = p_uid
  left join auth.users u on u.id = p_uid
  left join lateral (
    select name from public.clients where owner_user_id = p_uid limit 1
  ) c on true;
$$;

revoke all on function public.audit_actor(uuid) from public, anon, authenticated;

-- The person behind a write. Booking saves use the service-role key (the split
-- columns have no grant for a session), which leaves auth.uid() empty; the
-- app names the user in a header, trusted only alongside that key.
create or replace function public.audit_uid()
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    auth.uid(),
    case when auth.role() = 'service_role' then (
      select h::uuid
      from (select current_setting('request.headers', true)::json ->> 'x-hostello-actor' as h) x
      -- A malformed value names nobody rather than failing the write.
      where h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) end
  );
$$;

revoke all on function public.audit_uid() from public, anon, authenticated;

-- ── Row changes on the app's own tables ────────────────────────────────────

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Bookkeeping columns that change without anyone changing anything. A sync
  -- stamping `last_synced_at` every minute is not an event.
  v_ignore constant text[] := array[
    'updated_at', 'last_synced_at', 'last_error', 'last_event_count',
    'last_fetched_at', 'fetch_count', 'token'
  ];
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'token' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'token' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_category text;
  v_label text;
  v_client uuid;
  v_property uuid;
  v_booking uuid;
  v_cascaded boolean;
  v_actor record;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k))
    into v_changes
    from jsonb_object_keys(v_new) k
    where k <> all (v_ignore)
      and (v_old -> k) is distinct from (v_new -> k);

    if v_changes is null then
      return null;
    end if;
  end if;

  v_client := nullif(v_row ->> 'client_id', '')::uuid;
  v_property := nullif(v_row ->> 'property_id', '')::uuid;
  v_booking := nullif(v_row ->> 'booking_id', '')::uuid;

  -- A foreign-key cascade removes the parent first, so a deleted row whose
  -- parent is already gone went with it rather than on its own.
  -- (pg_trigger_depth() does not count cascades.)
  v_cascaded := tg_op = 'DELETE' and (
    (v_client is not null and not exists (select 1 from clients where id = v_client))
    or (v_property is not null and not exists (select 1 from properties where id = v_property))
    or (v_booking is not null and not exists (select 1 from bookings where id = v_booking))
  );

  case tg_table_name
    when 'bookings' then
      v_category := 'booking';
      v_booking := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'guest_name';
    when 'booking_properties', 'calendar_blocks', 'calendar_feeds', 'calendar_exports' then
      v_category := 'booking';
    when 'client_payouts', 'hostello_payouts' then
      v_category := 'money';
      v_label := 'PKR ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');
    when 'booking_receipts' then
      v_category := 'money';
      v_label := case v_row ->> 'kind'
        when 'guest_to_hostello' then 'Receipt: guest to Hostello'
        else 'Receipt: Hostello to owner' end;
    when 'booking_guest_ids' then
      v_category := 'money';
      v_label := 'Guest ID';
    when 'clients' then
      v_category := 'client';
      v_client := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'properties' then
      v_category := 'client';
      v_property := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'property_change_requests' then
      v_category := 'client';
    when 'profiles' then
      v_category := 'staff';
      v_label := v_row ->> 'full_name';
    else
      v_category := 'other';
  end case;

  -- Fill in what the row itself does not carry. A parent removed in the same
  -- delete is already gone, and the fields stay null; the parent's own entry,
  -- in the same tx, says what it was.
  if v_client is null and v_property is not null then
    select client_id into v_client from properties where id = v_property;
  end if;
  if v_client is null and v_booking is not null then
    select client_id into v_client from bookings where id = v_booking;
  end if;
  if v_label is null and v_property is not null then
    select name into v_label from properties where id = v_property;
  end if;
  if tg_table_name = 'calendar_blocks' then
    v_label := concat_ws(' · ', v_label, (v_row ->> 'start_date') || ' → ' || (v_row ->> 'end_date'));
  end if;

  select * into v_actor from audit_actor(audit_uid());

  insert into audit_log (
    actor_id, actor_name, actor_role, category, action, table_name, record_id,
    label, client_id, property_id, booking_id, changes, snapshot, cascaded
  ) values (
    v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, v_category, lower(tg_op),
    tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'booking_id'),
    v_label, v_client, v_property, v_booking, v_changes,
    case when tg_op = 'UPDATE' then null else v_row end,
    v_cascaded
  );

  return null;
exception when others then
  -- The log must never be the reason a booking or a payment fails to save.
  raise warning 'audit_row(%): %', tg_table_name, sqlerrm;
  return null;
end;
$$;

revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'bookings', 'booking_properties', 'calendar_blocks', 'calendar_feeds', 'calendar_exports',
    'client_payouts', 'hostello_payouts', 'booking_receipts', 'booking_guest_ids',
    'clients', 'properties', 'property_change_requests', 'profiles'
  ] loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- ── Logins: created, removed, signed in, password, access ──────────────────

create or replace function public.audit_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor record;
  v_self record;
  v_action text;
  v_email text := coalesce(new.email, old.email)::text;
begin
  select * into v_actor from public.audit_actor(auth.uid());

  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', 'login_created', 'users', new.id::text, v_email);
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', 'login_deleted', 'users', old.id::text, v_email);
    return null;
  end if;

  -- Auth itself signs people in and saves their own password changes, with no
  -- session of its own; the person those are about is the one acting.
  select * into v_self from public.audit_actor(new.id);

  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_self.actor_id, v_self.actor_name, v_self.actor_role, 'signin', 'sign_in', 'users', new.id::text, v_email);
  end if;

  if auth.uid() is null then
    v_actor := v_self;
  end if;

  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', 'password_changed', 'users', new.id::text, v_email);
  end if;

  if new.email is distinct from old.email then
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label, changes)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', 'email_changed', 'users', new.id::text, v_email,
            jsonb_build_object('email', jsonb_build_array(old.email, new.email)));
  end if;

  if (new.banned_until > now()) is distinct from (old.banned_until > now()) then
    v_action := case when new.banned_until > now() then 'access_removed' else 'access_restored' end;
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', v_action, 'users', new.id::text, v_email);
  end if;

  return null;
exception when others then
  -- Never the reason someone cannot sign in.
  raise warning 'audit_auth_user: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.audit_auth_user() from public, anon, authenticated;

create trigger audit_auth_users
  after insert or update or delete on auth.users
  for each row execute function public.audit_auth_user();

-- ── Failed sign-ins ─────────────────────────────────────────────────────────
-- Auth records nothing about a wrong password, so the login action reports it.
-- The caller has no session by definition, which makes this open to anyone
-- with the public key; the caps keep that from flooding the log.

create or replace function public.log_sign_in_failed(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_actor record;
begin
  if v_email = '' or length(v_email) > 320 then
    return;
  end if;

  if (select count(*) from audit_log
      where action = 'sign_in_failed' and label = v_email and at > now() - interval '15 minutes') >= 50
     or (select count(*) from audit_log
         where action = 'sign_in_failed' and at > now() - interval '15 minutes') >= 300 then
    return;
  end if;

  select id into v_user from auth.users where email = v_email;
  select * into v_actor from audit_actor(v_user);

  insert into audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
  values (v_user, coalesce(v_actor.actor_name, v_email),
          case when v_user is null then 'unknown' else v_actor.actor_role end,
          'signin', 'sign_in_failed', 'users', v_user::text, v_email);
end;
$$;

revoke all on function public.log_sign_in_failed(text) from public;
grant execute on function public.log_sign_in_failed(text) to anon, authenticated;

-- ── Alerts ──────────────────────────────────────────────────────────────────
-- A few entries are worth interrupting the admin for. They go through the
-- ordinary notifications table, so the bell, the feed and the live tone all
-- work; the Server Actions that can cause one push it to phones.

create or replace function public.audit_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_category text := 'system';
  v_title text;
  v_body text;
  v_key text;
  v_client_name text;
  v_parts text[];
  v_col text;
  v_word text;
begin
  if new.client_id is not null then
    select name into v_client_name from clients where id = new.client_id;
  end if;

  if new.actor_role = 'ops' and new.table_name = 'bookings' and new.action = 'update' then
    if new.changes ? 'status' and new.changes -> 'status' ->> 1 = 'cancelled' then
      v_kind := 'audit_staff_cancelled';
      v_category := 'booking';
      v_title := new.actor_name || ' cancelled a booking';
      v_body := concat_ws(' · ', new.label, v_client_name);
    elsif new.changes ?| array['sale_price', 'advance_received', 'nightly_price'] then
      foreach v_col in array array['sale_price', 'advance_received', 'nightly_price'] loop
        if new.changes ? v_col then
          v_word := case v_col when 'sale_price' then 'Sale price'
                               when 'advance_received' then 'Advance'
                               else 'Nightly price' end;
          v_parts := v_parts || (v_word || ' ' ||
            coalesce(to_char((new.changes -> v_col ->> 0)::numeric, 'FM999,999,999,990'), '—') || ' → ' ||
            coalesce(to_char((new.changes -> v_col ->> 1)::numeric, 'FM999,999,999,990'), '—'));
        end if;
      end loop;
      v_kind := 'audit_staff_price';
      v_category := 'booking';
      v_title := new.actor_name || ' changed a price';
      v_body := concat_ws(' · ', new.label, v_client_name, array_to_string(v_parts, ', '));
    end if;

  elsif new.action = 'delete' and not new.cascaded and new.actor_role in ('ops', 'client')
        and new.table_name in ('clients', 'properties', 'bookings', 'booking_receipts', 'booking_guest_ids') then
    v_kind := 'audit_deleted';
    v_title := new.actor_name || ' deleted ' || case new.table_name
      when 'clients' then 'a client'
      when 'properties' then 'a unit'
      when 'bookings' then 'a booking'
      when 'booking_receipts' then 'a receipt'
      else 'a guest ID' end;
    v_body := concat_ws(' · ', new.label, v_client_name);

  elsif new.action = 'sign_in_failed' then
    if (select count(*) from audit_log
        where action = 'sign_in_failed' and label = new.label and at > now() - interval '15 minutes') >= 5 then
      v_kind := 'audit_sign_in_failed';
      v_category := 'critical';
      v_title := 'Repeated wrong passwords';
      v_body := new.label || ' · 5 or more failed sign-ins in 15 minutes';
      -- One alert per email per quarter hour, however long the guessing goes on.
      v_key := 'signin-fail:' || new.label || ':' || floor(extract(epoch from new.at) / 900)::bigint;
    end if;
  end if;

  if v_kind is null then
    return null;
  end if;

  insert into notifications (kind, category, audience, title, body, client_id, booking_id, property_id, actor_user_id, event_key)
  values (v_kind, v_category, 'admin', v_title, v_body,
          case when new.action = 'delete' and new.table_name = 'clients' then null else new.client_id end,
          case when new.action = 'delete' and new.table_name = 'bookings' then null else new.booking_id end,
          case when new.action = 'delete' and new.table_name = 'properties' then null else new.property_id end,
          new.actor_id, coalesce(v_key, 'audit:' || new.id))
  on conflict (event_key) where event_key is not null do nothing;

  return null;
exception when others then
  raise warning 'audit_alert: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.audit_alert() from public, anon, authenticated;

create trigger audit_log_alert
  after insert on public.audit_log
  for each row execute function public.audit_alert();
