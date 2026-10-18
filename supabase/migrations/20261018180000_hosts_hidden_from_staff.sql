-- Host mode: Hostello's own admin and ops screens do not see self-serve hosts' data.
-- The one exception is the admin looking at a host through "View as host": the app
-- then sends the host's id in the x-hostello-view-as header, and only an admin's
-- request is allowed to use it.
-- Applied to the live DB as `hosts_hidden_from_staff` and `hosts_out_of_channel_health`
-- on 2026-10-18.

create or replace function public.view_as_header() returns text
language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-hostello-view-as', ''), '');
$$;
revoke execute on function public.view_as_header() from public, anon;
grant execute on function public.view_as_header() to authenticated;

-- True for anyone who is not staff, for managed clients' rows, and for a host's rows
-- only when the admin is viewing that host.
create or replace function public.staff_may_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_client_id is null then true
    when not is_staff() then true
    when not exists (select 1 from clients where id = p_client_id and account_type = 'host') then true
    else is_admin() and view_as_header() = p_client_id::text
  end;
$$;

create or replace function public.staff_may_see_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_property_id is null then true
    when not is_staff() then true
    else staff_may_see_client((select client_id from properties where id = p_property_id))
  end;
$$;

create or replace function public.staff_may_see_booking(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_booking_id is null then true
    when not is_staff() then true
    else staff_may_see_client((select client_id from bookings where id = p_booking_id))
  end;
$$;

create or replace function public.staff_may_see_feed(p_feed_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_feed_id is null then true
    when not is_staff() then true
    else staff_may_see_property((select property_id from calendar_feeds where id = p_feed_id))
  end;
$$;

grant execute on function public.staff_may_see_client(uuid), public.staff_may_see_property(uuid),
  public.staff_may_see_booking(uuid), public.staff_may_see_feed(uuid) to authenticated;
revoke execute on function public.staff_may_see_client(uuid), public.staff_may_see_property(uuid),
  public.staff_may_see_booking(uuid), public.staff_may_see_feed(uuid) from public, anon;

-- A restrictive policy is ANDed with every other policy on the table, so none of the
-- existing ones need to change.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('bookings', 'staff_may_see_client', 'client_id'),
      ('properties', 'staff_may_see_client', 'client_id'),
      ('booking_payments', 'staff_may_see_client', 'client_id'),
      ('property_photos', 'staff_may_see_client', 'client_id'),
      ('expenses', 'staff_may_see_client', 'client_id'),
      ('recurring_expenses', 'staff_may_see_client', 'client_id'),
      ('expense_budgets', 'staff_may_see_client', 'client_id'),
      ('expense_categories', 'staff_may_see_client', 'client_id'),
      ('review_requests', 'staff_may_see_client', 'client_id'),
      ('property_change_requests', 'staff_may_see_client', 'client_id'),
      ('audit_log', 'staff_may_see_client', 'client_id'),
      ('booking_properties', 'staff_may_see_booking', 'booking_id'),
      ('booking_receipts', 'staff_may_see_booking', 'booking_id'),
      ('booking_guest_ids', 'staff_may_see_booking', 'booking_id'),
      ('calendar_blocks', 'staff_may_see_property', 'property_id'),
      ('calendar_feeds', 'staff_may_see_property', 'property_id'),
      ('calendar_exports', 'staff_may_see_property', 'property_id'),
      ('coach_listings', 'staff_may_see_property', 'property_id'),
      ('coach_reports', 'staff_may_see_property', 'property_id'),
      ('coach_competitors', 'staff_may_see_property', 'property_id'),
      ('coach_fixes', 'staff_may_see_property', 'property_id'),
      ('ota_messages', 'staff_may_see_property', 'property_id'),
      ('calendar_sync_runs', 'staff_may_see_feed', 'feed_id')
    ) as v(tbl, fn, col)
  loop
    execute format(
      'create policy "hosts stay out of staff screens" on public.%I as restrictive for all to authenticated using (public.%I(%I)) with check (public.%I(%I))',
      t.tbl, t.fn, t.col, t.fn, t.col);
  end loop;
end $$;

-- The three views staff read through scope their own rows, so they get the same test.
do $$
declare
  v record;
  v_def text;
begin
  for v in
    select * from (values
      ('bookings_v', 'b.client_id'),
      ('properties_v', 'p.client_id'),
      ('clients_v', 'c.id')
    ) as x(name, col)
  loop
    v_def := pg_get_viewdef(('public.' || v.name)::regclass);
    if position('WHERE (is_staff() OR' in v_def) = 0 then
      raise exception '% no longer has the expected staff test', v.name;
    end if;
    v_def := replace(v_def, 'WHERE (is_staff() OR', 'WHERE ((is_staff() AND staff_may_see_client(' || v.col || ')) OR');
    execute format('create or replace view public.%I with (security_invoker = false) as %s', v.name, rtrim(v_def, '; '));
  end loop;
end $$;

-- The Hosts page needs unit counts the restrictive policies now hide from it.
create or replace function public.admin_host_units() returns table (client_id uuid, units integer)
language sql stable security definer set search_path = public as $$
  select c.id, (select count(*)::int from properties p where p.client_id = c.id)
  from clients c
  where c.account_type = 'host' and is_admin();
$$;
revoke execute on function public.admin_host_units() from public, anon;
grant execute on function public.admin_host_units() to authenticated;

-- Hostello's own channel-health checks look at Hostello's own links. A host's links are
-- theirs to watch, and a healthy host link must not hide Hostello's stopped sync.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.check_channel_health()'::regprocedure);
  if position('c.deactivated_at is null' in v_def) = 0 then
    raise exception 'check_channel_health no longer has the expected client test';
  end if;
  execute replace(v_def, 'c.deactivated_at is null', 'c.deactivated_at is null and c.account_type = ''managed''');

  v_def := pg_get_functiondef('public.unexplained_channel_holds(interval)'::regprocedure);
  if position('join properties p on p.id = cb.property_id' in v_def) = 0 then
    raise exception 'unexplained_channel_holds no longer has the expected join';
  end if;
  execute replace(
    v_def,
    'join properties p on p.id = cb.property_id',
    'join properties p on p.id = cb.property_id join clients hc on hc.id = p.client_id and hc.account_type = ''managed'''
  );
end $$;
