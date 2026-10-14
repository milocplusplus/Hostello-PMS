-- Listing Coach: the suggested description, one text per Airbnb box.
--
-- The audit wrote one description of up to 2,500 characters; Airbnb's
-- "Listing description" box takes 500. The audit now writes Airbnb's four
-- boxes separately, and coach_save_report() refuses a box that is too long
-- instead of clipping it.

alter table public.coach_reports
  add column suggested_space text,
  add column suggested_access text,
  add column suggested_notes text;

create or replace function public.coach_save_report(p jsonb) returns text
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
  v_boxes jsonb := '{}'::jsonb;
  v_long text := '';
  v_key text;
  v_max integer;
  v_text text;
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

  -- Airbnb's four description boxes. 500 is Airbnb's own limit on the first;
  -- the others are ours. A box over its limit is not kept, and the answer says
  -- so, because a clipped description stops mid-sentence. WORDING_BOXES in
  -- src/lib/listing-coach.ts holds the same numbers; change both together.
  for v_key, v_max in
    select * from (values ('suggested_description', 500), ('suggested_space', 1000),
                          ('suggested_access', 500), ('suggested_notes', 500)) b(k, m)
  loop
    v_text := nullif(trim(p->>v_key), '');
    continue when not v_audited or v_text is null;
    if length(v_text) > v_max then
      v_long := v_long || format(' %s is %s characters and the most allowed is %s, so it was NOT kept: shorten it and save this report again.',
                                 v_key, length(v_text), v_max);
    else
      v_boxes := v_boxes || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  insert into coach_reports (
    property_id, run_on, title, rating, review_count, photo_count,
    weekend_from, weekend_usd, weekend_median_usd,
    weekday_from, weekday_usd, weekday_median_usd,
    usd_pkr, search_position, search_pages, position_change, price_flag, competitors,
    audited, summary, title_options,
    suggested_description, suggested_space, suggested_access, suggested_notes)
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
    v_boxes->>'suggested_description', v_boxes->>'suggested_space',
    v_boxes->>'suggested_access', v_boxes->>'suggested_notes')
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
    suggested_space = coalesce(excluded.suggested_space, coach_reports.suggested_space),
    suggested_access = coalesce(excluded.suggested_access, coach_reports.suggested_access),
    suggested_notes = coalesce(excluded.suggested_notes, coach_reports.suggested_notes),
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

  return 'saved ' || v_unit || ' for ' || v_today || v_long;
end;
$$;
