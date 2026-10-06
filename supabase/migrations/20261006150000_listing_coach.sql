-- Listing Coach: Airbnb listings watched by a scheduled Claude task that reads
-- Airbnb in a browser and saves what it finds here. The app only reads these
-- tables (and lets the admin pick listings, competitors and tick fixes); every
-- report is written by coach_save_report(), which the task calls as postgres.

create table public.coach_listings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  -- As pasted: /rooms/<number> or a /h/<name> short link. The task's browser
  -- follows the short link; nothing on the server has to.
  airbnb_url text not null,
  watching boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.coach_competitors (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.coach_listings(property_id) on delete cascade,
  airbnb_url text not null check (airbnb_url ~ '^https://www\.airbnb\.com/rooms/[0-9]+$'),
  title text,
  source text not null default 'staff' check (source in ('ai', 'staff')),
  created_at timestamptz not null default now(),
  unique (property_id, airbnb_url)
);

create table public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.coach_listings(property_id) on delete cascade,
  run_on date not null,
  title text,
  rating numeric(3,2),
  review_count integer,
  photo_count integer,
  -- Totals for a two-night stay, in dollars as Airbnb shows a visitor.
  weekend_from date,
  weekend_usd numeric(10,2),
  weekend_median_usd numeric(10,2),
  weekday_from date,
  weekday_usd numeric(10,2),
  weekday_median_usd numeric(10,2),
  usd_pkr numeric(10,4),
  -- Null with search_pages > 0 means "not in the pages looked at".
  search_position integer,
  search_pages integer not null default 0,
  -- Places fallen since the report before; negative is a rise.
  position_change integer,
  price_flag boolean not null default false,
  competitors jsonb not null default '[]',
  -- The monthly audit's part; empty on the weeks in between.
  audited boolean not null default false,
  summary text,
  title_options text[] not null default '{}',
  suggested_description text,
  created_at timestamptz not null default now(),
  unique (property_id, run_on)
);

create table public.coach_fixes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.coach_listings(property_id) on delete cascade,
  area text not null check (area in ('title', 'description', 'photos', 'amenities', 'rules', 'price', 'reviews')),
  issue text not null,
  fix text not null,
  found_on date not null,
  -- The admin's tick. An audit then either confirms it or reopens it.
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  confirmed_on date,
  reopened_on date,
  created_at timestamptz not null default now()
);

create index coach_reports_property_run on public.coach_reports (property_id, run_on desc);
create index coach_fixes_property on public.coach_fixes (property_id);
create index coach_competitors_property on public.coach_competitors (property_id);

alter table public.coach_listings enable row level security;
alter table public.coach_competitors enable row level security;
alter table public.coach_reports enable row level security;
alter table public.coach_fixes enable row level security;

revoke all on public.coach_listings, public.coach_competitors, public.coach_reports, public.coach_fixes from anon;

create policy "coach_listings: admin full access" on public.coach_listings
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "coach_competitors: admin full access" on public.coach_competitors
  for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "coach_reports: admin reads" on public.coach_reports
  for select to authenticated using ((select is_admin()));
create policy "coach_fixes: admin reads" on public.coach_fixes
  for select to authenticated using ((select is_admin()));
create policy "coach_fixes: admin ticks" on public.coach_fixes
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));

-- The most recent Thursday 22:00 Karachi that has passed: the moment the
-- current weekly check became due.
create function public.coach_due_at() returns timestamptz
language sql stable set search_path = public as $$
  select (date_trunc('week', (now() at time zone 'Asia/Karachi') - interval '3 days 22 hours')
          + interval '3 days 22 hours') at time zone 'Asia/Karachi';
$$;

-- What the task has to do: the listings not yet checked since the check became
-- due (or all watched ones with p_all), the dates to price, and what the last
-- audit left open.
create function public.coach_work(p_all boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (
    select (now() at time zone 'Asia/Karachi')::date as today
  )
  select jsonb_build_object(
    'run_on', d.today,
    -- The next Friday and the next Tuesday strictly after today, two nights each.
    'weekend_from', d.today + ((5 - extract(isodow from d.today)::int + 6) % 7 + 1),
    'weekend_to',   d.today + ((5 - extract(isodow from d.today)::int + 6) % 7 + 3),
    'weekday_from', d.today + ((2 - extract(isodow from d.today)::int + 6) % 7 + 1),
    'weekday_to',   d.today + ((2 - extract(isodow from d.today)::int + 6) % 7 + 3),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'property_id', l.property_id,
        'unit', p.name,
        'client', c.name,
        'city', p.city,
        'type', p.type,
        'max_guests', p.max_guests,
        'airbnb_url', l.airbnb_url,
        'needs_audit', not exists (
          select 1 from coach_reports r
           where r.property_id = l.property_id and r.audited and r.run_on > d.today - 27),
        'competitors', coalesce((
          select jsonb_agg(k.airbnb_url order by k.created_at)
            from coach_competitors k where k.property_id = l.property_id), '[]'::jsonb),
        'open_fixes', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', f.id, 'area', f.area, 'issue', f.issue, 'ticked_done', f.done_at is not null)
                   order by f.created_at)
            from coach_fixes f
           where f.property_id = l.property_id and f.confirmed_on is null), '[]'::jsonb)
      ) order by c.name, p.name)
        from coach_listings l
        join properties p on p.id = l.property_id
        join clients c on c.id = p.client_id
       where l.watching
         and (p_all or not exists (
               select 1 from coach_reports r
                where r.property_id = l.property_id and r.created_at >= coach_due_at()))
    ), '[]'::jsonb)
  )
  from d;
$$;

-- One listing's report, as the task read it. Everything is re-shaped here:
-- lengths are clipped, links must be Airbnb room links, the medians, the price
-- flag and the search movement are worked out in SQL and not taken on trust.
create function public.coach_save_report(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prop uuid := (p->>'property_id')::uuid;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_unit text;
  v_client uuid;
  v_comp jsonb;
  v_weekend numeric := nullif(p->>'weekend_usd', '')::numeric;
  v_weekday numeric := nullif(p->>'weekday_usd', '')::numeric;
  v_weekend_mid numeric;
  v_weekday_mid numeric;
  v_pos integer := nullif(p->>'search_position', '')::integer;
  v_pages integer := least(greatest(coalesce(nullif(p->>'search_pages', '')::integer, 0), 0), 5);
  v_prev_pos integer;
  v_prev_pages integer;
  v_change integer;
  v_flag boolean;
  v_audited boolean := coalesce((p->>'audited')::boolean, false);
  v_titles text[];
begin
  select pr.name, pr.client_id into v_unit, v_client
    from coach_listings l join properties pr on pr.id = l.property_id
   where l.property_id = v_prop;
  if v_unit is null then
    raise exception 'coach_save_report: % is not a coach listing', v_prop;
  end if;

  select coalesce(jsonb_agg(x.o), '[]'::jsonb) into v_comp
    from (
      select jsonb_build_object(
               'url', c->>'url',
               'title', left(c->>'title', 120),
               'rating', case when c->>'rating' ~ '^[0-9](\.[0-9]+)?$' then (c->>'rating')::numeric end,
               'reviews', case when c->>'reviews' ~ '^[0-9]+$' then (c->>'reviews')::integer end,
               'weekend_usd', case when c->>'weekend_usd' ~ '^[0-9]+(\.[0-9]+)?$' then (c->>'weekend_usd')::numeric end,
               'weekday_usd', case when c->>'weekday_usd' ~ '^[0-9]+(\.[0-9]+)?$' then (c->>'weekday_usd')::numeric end
             ) as o
        from jsonb_array_elements(coalesce(p->'competitors', '[]'::jsonb)) c
       where c->>'url' ~ '^https://www\.airbnb\.com/rooms/[0-9]+$'
       limit 8
    ) x;

  select percentile_cont(0.5) within group (order by (c->>'weekend_usd')::numeric)
    into v_weekend_mid
    from jsonb_array_elements(v_comp) c where c->>'weekend_usd' is not null;
  select percentile_cont(0.5) within group (order by (c->>'weekday_usd')::numeric)
    into v_weekday_mid
    from jsonb_array_elements(v_comp) c where c->>'weekday_usd' is not null;

  -- Overpriced is a quarter above the competitors' middle price, on either stay.
  v_flag := coalesce(v_weekend > v_weekend_mid * 1.25, false)
         or coalesce(v_weekday > v_weekday_mid * 1.25, false);

  select r.search_position, r.search_pages into v_prev_pos, v_prev_pages
    from coach_reports r
   where r.property_id = v_prop and r.run_on < v_today
   order by r.run_on desc limit 1;
  -- Off the pages looked at counts as one place past the last of them.
  if v_pages > 0 and v_prev_pos is not null then
    v_change := coalesce(v_pos, v_pages * 18 + 1) - v_prev_pos;
  end if;

  -- A title Airbnb would refuse (over 50 characters) is not an option.
  select coalesce(array_agg(t), '{}') into v_titles
    from (
      select trim(o.v) as t
        from jsonb_array_elements_text(coalesce(p->'title_options', '[]'::jsonb)) o(v)
       where v_audited and length(trim(o.v)) between 5 and 50
       limit 3
    ) s;

  insert into coach_reports (
    property_id, run_on, title, rating, review_count, photo_count,
    weekend_from, weekend_usd, weekend_median_usd,
    weekday_from, weekday_usd, weekday_median_usd,
    usd_pkr, search_position, search_pages, position_change, price_flag, competitors,
    audited, summary, title_options, suggested_description)
  values (
    v_prop, v_today, left(p->>'title', 120),
    nullif(p->>'rating', '')::numeric, nullif(p->>'review_count', '')::integer,
    nullif(p->>'photo_count', '')::integer,
    nullif(p->>'weekend_from', '')::date, v_weekend, v_weekend_mid,
    nullif(p->>'weekday_from', '')::date, v_weekday, v_weekday_mid,
    nullif(p->>'usd_pkr', '')::numeric, v_pos, v_pages, v_change, v_flag, v_comp,
    v_audited,
    case when v_audited then left(p->>'summary', 600) end,
    v_titles,
    case when v_audited then left(p->>'suggested_description', 4000) end)
  on conflict (property_id, run_on) do update set
    title = excluded.title, rating = excluded.rating, review_count = excluded.review_count,
    photo_count = excluded.photo_count,
    weekend_from = excluded.weekend_from, weekend_usd = excluded.weekend_usd,
    weekend_median_usd = excluded.weekend_median_usd,
    weekday_from = excluded.weekday_from, weekday_usd = excluded.weekday_usd,
    weekday_median_usd = excluded.weekday_median_usd,
    usd_pkr = excluded.usd_pkr, search_position = excluded.search_position,
    search_pages = excluded.search_pages, position_change = excluded.position_change,
    price_flag = excluded.price_flag, competitors = excluded.competitors,
    -- A plain weekly re-run on an audit day keeps the audit it already has.
    audited = coach_reports.audited or excluded.audited,
    summary = coalesce(excluded.summary, coach_reports.summary),
    title_options = case when excluded.audited then excluded.title_options else coach_reports.title_options end,
    suggested_description = coalesce(excluded.suggested_description, coach_reports.suggested_description),
    created_at = now();

  -- The task's own picks become the saved competitors only while there are
  -- none: once the admin has a list, the admin's list is the list.
  if not exists (select 1 from coach_competitors where property_id = v_prop) then
    insert into coach_competitors (property_id, airbnb_url, title, source)
    select v_prop, c->>'url', c->>'title', 'ai'
      from jsonb_array_elements(v_comp) c
     limit 5
    on conflict do nothing;
  else
    update coach_competitors k set title = c->>'title'
      from jsonb_array_elements(v_comp) c
     where k.property_id = v_prop and k.airbnb_url = c->>'url' and c->>'title' is not null;
  end if;

  if v_audited then
    -- What the last audit left open, looked at again: gone from the listing is
    -- confirmed; ticked but still there is handed back.
    update coach_fixes f
       set confirmed_on = case when not (c->>'still_present')::boolean then v_today end,
           reopened_on = case when (c->>'still_present')::boolean and f.done_at is not null then v_today else f.reopened_on end,
           done_at = case when (c->>'still_present')::boolean then null else f.done_at end,
           done_by = case when (c->>'still_present')::boolean then null else f.done_by end
      from jsonb_array_elements(coalesce(p->'fixes_checked', '[]'::jsonb)) c
     where f.property_id = v_prop and f.confirmed_on is null
       and f.id::text = c->>'id'
       and c->>'still_present' in ('true', 'false');

    insert into coach_fixes (property_id, area, issue, fix, found_on)
    select v_prop, c->>'area', left(c->>'issue', 300), left(c->>'fix', 400), v_today
      from jsonb_array_elements(coalesce(p->'new_fixes', '[]'::jsonb)) c
     where c->>'area' in ('title', 'description', 'photos', 'amenities', 'rules', 'price', 'reviews')
       and length(trim(coalesce(c->>'issue', ''))) > 0 and length(trim(coalesce(c->>'fix', ''))) > 0
     limit 15;
  end if;

  if v_flag then
    insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
    values ('listing_coach_price', 'system', 'admin',
            v_unit || ' is priced above similar listings',
            concat_ws(' · ',
              case when v_weekend > v_weekend_mid * 1.25
                   then 'Weekend $' || round(v_weekend) || ' against a middle price of $' || round(v_weekend_mid) end,
              case when v_weekday > v_weekday_mid * 1.25
                   then 'Weekday $' || round(v_weekday) || ' against $' || round(v_weekday_mid) end,
              'for two nights on Airbnb'),
            v_client, v_prop, 'coach-price:' || v_prop || ':' || v_today)
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  if v_change >= 5 then
    insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
    values ('listing_coach_rank', 'system', 'admin',
            v_unit || ' fell in Airbnb search',
            case when v_pos is null
                 then 'It was number ' || v_prev_pos || ' and is no longer in the first ' || v_pages || ' pages.'
                 else 'From number ' || v_prev_pos || ' to number ' || v_pos || ' for the coming weekend.' end,
            v_client, v_prop, 'coach-rank:' || v_prop || ':' || v_today)
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  return 'saved ' || v_unit || ' for ' || v_today;
end;
$$;

-- The task's last call: one "ready" notice for the day's run.
create function public.coach_finish_run() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_n integer;
  v_high integer;
  v_fell integer;
begin
  select count(*), count(*) filter (where price_flag), count(*) filter (where position_change >= 5)
    into v_n, v_high, v_fell
    from coach_reports where run_on = v_today;
  if v_n = 0 then return 'nothing saved today'; end if;

  insert into notifications (kind, category, audience, title, body, event_key)
  values ('listing_coach_ready', 'system', 'admin',
          'Listing check ready',
          concat_ws(' · ',
            v_n || case when v_n = 1 then ' listing checked' else ' listings checked' end,
            case when v_high > 0 then v_high || ' priced high' end,
            case when v_fell > 0 then v_fell || ' fell in search' end),
          'coach-ready:' || v_today)
  on conflict (event_key) where event_key is not null do nothing;
  return v_n || ' reports today';
end;
$$;

-- Daily, 10:00 Karachi: a watched listing still unchecked since the check came
-- due means the laptop has not run it. Once a day until it has. A listing
-- added after the due moment waits for the next one.
create function public.coach_check_due() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_missing integer;
  v_n integer := 0;
begin
  select count(*) into v_missing
    from coach_listings l
   where l.watching and l.created_at < coach_due_at()
     and not exists (
       select 1 from coach_reports r
        where r.property_id = l.property_id and r.created_at >= coach_due_at());

  if v_missing > 0 then
    insert into notifications (kind, category, audience, title, body, event_key)
    values ('listing_coach_due', 'system', 'admin',
            'Listing check is waiting',
            'Open the Claude app on your laptop so this week''s Airbnb check can run. ' ||
              v_missing || case when v_missing = 1 then ' listing has' else ' listings have' end ||
              ' not been checked yet.',
            'coach-due:' || (now() at time zone 'Asia/Karachi')::date)
    on conflict (event_key) where event_key is not null do nothing;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;

revoke execute on function public.coach_due_at() from public, anon, authenticated;
revoke execute on function public.coach_work(boolean) from public, anon, authenticated;
revoke execute on function public.coach_save_report(jsonb) from public, anon, authenticated;
revoke execute on function public.coach_finish_run() from public, anon, authenticated;
revoke execute on function public.coach_check_due() from public, anon, authenticated;
grant execute on function public.coach_due_at(), public.coach_work(boolean),
  public.coach_save_report(jsonb), public.coach_finish_run(), public.coach_check_due() to service_role;

select cron.schedule('hostello-coach-due', '0 5 * * *', 'select public.coach_check_due();');
