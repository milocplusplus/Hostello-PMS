-- Channel sync health: history, failure streaks, and alerts.
--
-- Every sync ends in `sync_calendar_feed_apply` (it worked) or
-- `sync_calendar_feed_failed` (it did not); both now report to
-- `record_sync_run`, which keeps the streak, writes history and raises the
-- failing / recovered alerts. The two "gone quiet" alerts — the sync job not
-- running, a channel no longer reading our export — are found by
-- `check_channel_health()` on its own cron, since silence has no event.
-- All alerts go to staff (admin + ops): there is no money in them, and ops is
-- who fixes a calendar.

alter table public.calendar_feeds
  add column consecutive_failures integer not null default 0,
  add column last_success_at timestamptz;

-- Only runs that changed something or failed. A quiet minute is not history.
create table public.calendar_sync_runs (
  id bigint generated always as identity primary key,
  feed_id uuid not null references public.calendar_feeds(id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null,
  added integer not null default 0,
  updated integer not null default 0,
  removed integer not null default 0,
  clashes integer not null default 0,
  error text
);

create index calendar_sync_runs_feed_idx on public.calendar_sync_runs (feed_id, at desc);

alter table public.calendar_sync_runs enable row level security;
create policy calendar_sync_runs_staff_read on public.calendar_sync_runs
  for select to authenticated using ((select public.is_staff()));
revoke all on public.calendar_sync_runs from anon, authenticated;
grant select on public.calendar_sync_runs to authenticated;

create or replace function public.record_sync_run(
  p_feed_id uuid, p_ok boolean,
  p_added integer default 0, p_updated integer default 0,
  p_removed integer default 0, p_clashes integer default 0,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev integer;
  v_now integer;
  v_name text;
  v_client uuid;
  v_property uuid;
  v_label text;
begin
  select f.consecutive_failures, f.property_id, p.name, p.client_id,
         coalesce(f.label, case f.source when 'airbnb' then 'Airbnb' when 'booking_com' then 'Booking.com' else 'Channel' end)
    into v_prev, v_property, v_name, v_client, v_label
    from calendar_feeds f
    left join properties p on p.id = f.property_id
   where f.id = p_feed_id;

  if not found then
    return;
  end if;

  if p_ok then
    update calendar_feeds set consecutive_failures = 0, last_success_at = now() where id = p_feed_id;
    if p_added + p_updated + p_removed + p_clashes > 0 then
      insert into calendar_sync_runs (feed_id, ok, added, updated, removed, clashes)
      values (p_feed_id, true, p_added, p_updated, p_removed, p_clashes);
    end if;

    if v_prev >= 5 then
      insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
      values ('channel_sync_recovered', 'calendar', 'staff',
              v_label || ' link working again — ' || coalesce(v_name, 'a unit'),
              'It synced after ' || v_prev || ' failed attempts. Dates are up to date again.',
              v_client, v_property, 'sync-recovered:' || p_feed_id || ':' || extract(epoch from now())::bigint)
      on conflict (event_key) where event_key is not null do nothing;
    end if;
  else
    update calendar_feeds set consecutive_failures = consecutive_failures + 1
     where id = p_feed_id
    returning consecutive_failures into v_now;

    insert into calendar_sync_runs (feed_id, ok, error) values (p_feed_id, false, left(p_error, 500));

    -- Exactly at the fifth: one alert per outage, however long it lasts.
    if v_now = 5 then
      insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
      values ('channel_sync_failing', 'critical', 'staff',
              v_label || ' link failing — ' || coalesce(v_name, 'a unit'),
              '5 syncs in a row failed: ' || coalesce(left(p_error, 160), 'no reason given')
                || '. New channel bookings are not reaching the calendar.',
              v_client, v_property, 'sync-failing:' || p_feed_id || ':' || extract(epoch from now())::bigint)
      on conflict (event_key) where event_key is not null do nothing;
    end if;
  end if;

  delete from calendar_sync_runs where feed_id = p_feed_id and at < now() - interval '90 days';
end;
$$;

revoke all on function public.record_sync_run(uuid, boolean, integer, integer, integer, integer, text) from public, anon, authenticated;

create or replace function public.sync_calendar_feed_failed(p_feed_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.calendar_feeds
     set last_synced_at = now(), last_error = p_error
   where id = p_feed_id;
  perform public.record_sync_run(p_feed_id, false, p_error => p_error);
end;
$$;

do $$
declare d text;
begin
  select pg_get_functiondef('public.sync_calendar_feed_apply(uuid, jsonb)'::regprocedure) into d;
  if position('         last_event_count = v_count' || E'\n' || '   where id = v_feed.id;' in d) = 0 then
    raise exception 'sync_calendar_feed_apply changed shape';
  end if;
  execute replace(d,
    '         last_event_count = v_count' || E'\n' || '   where id = v_feed.id;',
    '         last_event_count = v_count' || E'\n' || '   where id = v_feed.id;' || E'\n\n' ||
    '  perform public.record_sync_run(v_feed.id, true, v_added, v_updated, v_removed, v_clashes);');
end;
$$;

-- ── Silence ─────────────────────────────────────────────────────────────────

create or replace function public.check_channel_health()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_sent integer := 0;
  v_n integer;
begin
  -- The sync job itself: nothing has been attempted on any live link for 30
  -- minutes. Keyed on the last attempt, so one outage is one alert.
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

  -- Our export: a channel that has not read it for 24 hours may be selling
  -- nights we have since filled.
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

  return v_sent + v_n;
end;
$$;

revoke all on function public.check_channel_health() from public, anon, authenticated;

select cron.schedule('hostello-channel-health', '*/10 * * * *', 'select public.check_channel_health();');

-- Reading resumed after an alert: say so once.
create or replace function public.notify_export_read_again()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_fetched_at is not null
     and coalesce(old.last_fetched_at, old.created_at) < now() - interval '24 hours' then
    insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
    select 'channel_sync_recovered', 'calendar', 'staff',
           'Channels reading ' || p.name || '''s calendar again',
           'A channel fetched the export link, so it has current dates again.',
           p.client_id, p.id,
           'export-read-again:' || new.id || ':' || extract(epoch from new.last_fetched_at)::bigint
      from properties p where p.id = new.property_id
    on conflict (event_key) where event_key is not null do nothing;
  end if;
  return null;
end;
$$;

revoke all on function public.notify_export_read_again() from public, anon, authenticated;

create trigger calendar_exports_read_again
  after update of last_fetched_at on public.calendar_exports
  for each row execute function public.notify_export_read_again();

-- The streak and last-success stamp move every minute; the audit log is for
-- things a person would call a change.
do $$
declare d text;
begin
  select pg_get_functiondef('public.audit_row()'::regprocedure) into d;
  if position('''last_fetched_at'', ''fetch_count'', ''token''' in d) = 0 then
    raise exception 'audit_row changed shape';
  end if;
  execute replace(d, '''last_fetched_at'', ''fetch_count'', ''token''',
    '''last_fetched_at'', ''fetch_count'', ''token'', ''consecutive_failures'', ''last_success_at''');
end;
$$;
