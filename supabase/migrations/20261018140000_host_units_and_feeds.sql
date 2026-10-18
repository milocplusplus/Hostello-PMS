-- Host mode, phase 3: a host manages their own units and calendar links.
-- Applied to the live DB as `host_units_and_feeds` on 2026-10-18.
-- Managed owners keep read-only access: their asking prices are Hostello's to set.
create or replace function public.owns_host_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id = p_client_id
      and c.account_type = 'host'
      and c.owner_user_id = (select auth.uid()));
$$;
grant execute on function public.owns_host_client(uuid) to authenticated;

create or replace function public.owns_host_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties p
    join clients c on c.id = p.client_id
    where p.id = p_property_id
      and c.account_type = 'host'
      and c.owner_user_id = (select auth.uid()));
$$;
grant execute on function public.owns_host_property(uuid) to authenticated;

create policy "properties: host adds own" on public.properties
  for insert to authenticated with check (owns_host_client(client_id));
create policy "properties: host edits own" on public.properties
  for update to authenticated using (owns_host_client(client_id)) with check (owns_host_client(client_id));

create policy "calendar_feeds: host manages own" on public.calendar_feeds
  for all to authenticated using (owns_host_property(property_id)) with check (owns_host_property(property_id));
create policy "calendar_exports: host manages own" on public.calendar_exports
  for all to authenticated using (owns_host_property(property_id)) with check (owns_host_property(property_id));

-- The server fetches whatever link is saved, so a host's link may only be a
-- calendar from Airbnb or Booking.com (https, no credentials, no port).
create or replace function public.enforce_host_feed_url() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if owns_host_property_any(new.property_id) and new.url !~* (
    '^https://([a-z0-9-]+\.)*(airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|booking\.com)/'
  ) then
    raise exception 'Only Airbnb or Booking.com calendar links can be connected.';
  end if;
  return new;
end $$;

-- Same test without the caller check, for the trigger (admins editing a host's link too).
create or replace function public.owns_host_property_any(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties p join clients c on c.id = p.client_id
    where p.id = p_property_id and c.account_type = 'host');
$$;
revoke execute on function public.owns_host_property_any(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_host_feed_url() from public, anon, authenticated;

create trigger calendar_feeds_host_url before insert or update of url, property_id on public.calendar_feeds
  for each row execute function public.enforce_host_feed_url();
