-- Review requests: one row per Airbnb stay that has ended (or ends tomorrow),
-- so staff can ask the guest for an Airbnb review and tick what was done.
-- Rows are written only by raise_review_requests() on its hourly cron; the app
-- reads them and updates the three ticks.

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Null for a stay known only from the Airbnb calendar link: dates, no guest.
  booking_id uuid references public.bookings(id) on delete cascade,
  check_in date,
  -- The departure day (a booking's exclusive check_out; a hold's end_date + 1).
  leaves_on date not null,
  asked_at timestamptz,
  asked_by uuid references public.profiles(id) on delete set null,
  guest_reviewed_at timestamptz,
  review_received_at timestamptz,
  created_at timestamptz not null default now(),
  -- One Airbnb stay ends per unit per day: this is what stops a calendar hold
  -- and the booking typed in for the same stay becoming two requests.
  unique (property_id, leaves_on)
);

create unique index review_requests_booking on public.review_requests (booking_id) where booking_id is not null;
create index review_requests_leaves_on on public.review_requests (leaves_on);

alter table public.review_requests enable row level security;
revoke all on public.review_requests from anon;

create policy "review_requests: staff read" on public.review_requests
  for select to authenticated using ((select is_staff()));
create policy "review_requests: staff tick" on public.review_requests
  for update to authenticated using ((select is_staff())) with check ((select is_staff()));

-- Hourly. Writes a request for every Airbnb stay leaving from a week ago to
-- tomorrow, and from 07:00 Karachi on the departure day tells staff once.
-- Tomorrow is included because Airbnb's calendar can drop a stay the day it
-- ends; the list only shows a request from its departure day.
create function public.raise_review_requests() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_hour integer := extract(hour from now() at time zone 'Asia/Karachi');
  v_n integer := 0;
begin
  -- A booking typed in after its calendar hold already raised a request takes
  -- that request over, so it gains the guest's name.
  -- One unit per booking: its index allows a booking a single request.
  update review_requests r
     set booking_id = s.id, check_in = s.check_in
    from (
      select distinct on (b.id) b.id, b.check_in, h.id as request_id
        from bookings b
        join booking_properties bp on bp.booking_id = b.id
        join review_requests h
          on h.booking_id is null and h.property_id = bp.property_id
         and h.leaves_on = case when b.is_short_stay then b.check_in else b.check_out end
       where b.source = 'airbnb' and b.status = 'confirmed'
         and not exists (select 1 from review_requests x where x.booking_id = b.id)
       order by b.id, h.created_at
    ) s
   where r.id = s.request_id;

  insert into review_requests (property_id, client_id, booking_id, check_in, leaves_on)
  select distinct on (b.id)
         bp.property_id, b.client_id, b.id, b.check_in,
         case when b.is_short_stay then b.check_in else b.check_out end
    from bookings b
    join booking_properties bp on bp.booking_id = b.id
    join properties p on p.id = bp.property_id
   where b.source = 'airbnb' and b.status = 'confirmed'
     and (case when b.is_short_stay then b.check_in else b.check_out end) between v_today - 7 and v_today + 1
   order by b.id, p.name
  on conflict do nothing;

  -- Stays the Airbnb calendar link imported that nobody has written up.
  insert into review_requests (property_id, client_id, booking_id, check_in, leaves_on)
  select k.property_id, p.client_id, null, k.start_date, k.end_date + 1
    from calendar_blocks k
    join calendar_feeds f on f.id = k.feed_id
    join properties p on p.id = k.property_id
   where f.source = 'airbnb' and k.block_type = 'booked' and k.booking_id is null
     and k.end_date + 1 between v_today - 7 and v_today + 1
  on conflict do nothing;

  if v_hour >= 7 then
    insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
    select 'review_request_due', 'booking', 'staff',
           coalesce(nullif(split_part(trim(b.guest_name), ' ', 1), ''), 'The Airbnb guest') ||
             ' leaves ' || p.name || ' today',
           'Ask for an Airbnb review. The message is ready on the Today page.',
           r.client_id, r.property_id, 'review-due:' || r.id
      from review_requests r
      join properties p on p.id = r.property_id
      left join bookings b on b.id = r.booking_id
     where r.leaves_on = v_today and r.asked_at is null
       and (b.id is null or b.status = 'confirmed')
    on conflict (event_key) where event_key is not null do nothing;
    get diagnostics v_n = row_count;
  end if;

  return v_n;
end;
$$;

revoke execute on function public.raise_review_requests() from public, anon, authenticated;
grant execute on function public.raise_review_requests() to service_role;

select cron.schedule('hostello-review-requests', '25 * * * *', 'select public.raise_review_requests();');
