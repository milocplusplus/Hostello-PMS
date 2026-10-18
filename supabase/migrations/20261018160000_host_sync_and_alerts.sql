-- Host mode, phase 4: a paused host is not synced, a host's events reach the host and
-- not Hostello's staff, and a unit takes at most four calendar links.
-- Applied to the live DB as `host_sync_and_alerts` on 2026-10-18.

create or replace function public.host_is_paused(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c join subscriptions s on s.client_id = c.id
    where c.id = p_client_id and c.account_type = 'host' and s.status = 'paused');
$$;
revoke execute on function public.host_is_paused(uuid) from public, anon, authenticated;

-- The sync already stops for a deactivated client; a paused host stops the same way.
do $$
declare
  v_def text := pg_get_functiondef('public.sync_calendar_feed_apply(uuid, jsonb)'::regprocedure);
  v_old text := 'dc.id = v_client_id and dc.deactivated_at is not null) then';
  v_new text := 'dc.id = v_client_id and dc.deactivated_at is not null) or public.host_is_paused(v_client_id) then';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'sync_calendar_feed_apply no longer has the expected pause check';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- Hostello's staff are not told about every host's bookings and calendar. A host's
-- own alerts (audience client or both) and the two calendar kinds the sync raises
-- for a stay they have to complete reach the host instead.
create or replace function public.fan_out_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_host boolean := false;
begin
  if new.client_id is not null then
    select c.account_type = 'host' into v_host from clients c where c.id = new.client_id;
  end if;

  if not coalesce(v_host, false) and new.audience in ('admin', 'staff', 'both') then
    insert into notification_recipients (notification_id, user_id)
    select new.id, p.id
    from profiles p
    where (p.role = 'admin' or (new.audience = 'staff' and p.role = 'ops'))
      and p.id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  if new.client_id is not null
     and (new.audience in ('client', 'both')
          or (coalesce(v_host, false) and new.kind in ('channel_reservation', 'calendar_conflict')))
     and owner_notice_allowed(new.client_id, new.kind) then
    insert into notification_recipients (notification_id, user_id)
    select new.id, c.owner_user_id
    from clients c
    where c.id = new.client_id
      and c.owner_user_id is not null
      and c.deactivated_at is null
      and c.owner_user_id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  return new;
end $$;

-- A host's link also counts: at most four per unit.
create or replace function public.enforce_host_feed_url() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if owns_host_property_any(new.property_id) then
    if new.url !~* (
      '^https://([a-z0-9-]+\.)*(airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|booking\.com)/'
    ) then
      raise exception 'Only Airbnb or Booking.com calendar links can be connected.';
    end if;
    if tg_op = 'INSERT' and (select count(*) from calendar_feeds where property_id = new.property_id) >= 4 then
      raise exception 'A property can have at most 4 calendar links.';
    end if;
  end if;
  return new;
end $$;
