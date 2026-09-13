-- Rate and capacity change requests -----------------------------------------
--
-- `properties` is SELECT-only for a client: the RLS policy has no INSERT and no
-- UPDATE, so an owner who wants their unit's asking price or sleeps-count
-- changed has had to phone Hostello. That stays true -- the asking price is what
-- a guest is quoted and what the availability finder offers, so it is not an
-- owner's to set unilaterally. This table is the ask, not the change: the owner
-- proposes, an admin applies it, and applying is an ordinary write to
-- `properties` by someone whose policy already allows it.
--
-- Deliberately only max_guests and nightly_rate. `stack_rate` is the owner's
-- guaranteed floor under a stack deal -- a deal term, negotiated, blanked for
-- ops -- and must never be settable from a form the owner fills in alone.

create table if not exists property_change_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  -- Denormalised from the property so RLS and the admin queue can scope without
  -- a join, the same call `client_payout_allocations` makes.
  client_id uuid not null references clients(id) on delete cascade,
  -- Null means "leave this one alone" -- a request may ask for either field or
  -- both, which is why neither is `not null` and the constraint below is.
  max_guests integer,
  nightly_rate numeric,
  note text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'declined')),
  admin_note text,
  requested_by uuid references profiles(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint property_change_requests_asks_for_something
    check (max_guests is not null or nightly_rate is not null),
  constraint property_change_requests_max_guests_positive
    check (max_guests is null or max_guests > 0),
  constraint property_change_requests_nightly_rate_nonneg
    check (nightly_rate is null or nightly_rate >= 0)
);

create index if not exists property_change_requests_client_idx
  on property_change_requests (client_id, created_at desc);
create index if not exists property_change_requests_status_idx
  on property_change_requests (status, created_at desc);

-- One open ask per unit. Without this an owner can stack five requests on one
-- property and an admin can apply a stale one on top of a newer one.
create unique index if not exists property_change_requests_one_open_per_property
  on property_change_requests (property_id) where status = 'pending';

alter table property_change_requests enable row level security;

create policy "property_change_requests: admin full access" on property_change_requests
  for all using (is_admin()) with check (is_admin());

-- Ops answers enquiries off `nightly_rate`, so it may read the queue -- but
-- applying one is a write to `properties`, which ops has no policy for.
create policy "property_change_requests: ops reads" on property_change_requests
  for select using (is_ops());

create policy "property_change_requests: client reads own" on property_change_requests
  for select using (exists (
    select 1 from clients c
    where c.id = property_change_requests.client_id and c.owner_user_id = auth.uid()
  ));

-- The property must be theirs *and* the denormalised client_id must be the one
-- that owns it, or a request could be filed against someone else's balance.
create policy "property_change_requests: client files own" on property_change_requests
  for insert with check (
    status = 'pending'
    and exists (
      select 1 from properties pr
      join clients c on c.id = pr.client_id
      where pr.id = property_change_requests.property_id
        and pr.client_id = property_change_requests.client_id
        and c.owner_user_id = auth.uid()
    )
  );

-- Withdrawing is deleting, and only while nobody has ruled on it. There is no
-- UPDATE policy on purpose: an owner correcting an ask withdraws and files
-- again, so a request an admin is looking at cannot change underneath them.
create policy "property_change_requests: client withdraws own pending" on property_change_requests
  for delete using (
    status = 'pending'
    and exists (
      select 1 from clients c
      where c.id = property_change_requests.client_id and c.owner_user_id = auth.uid()
    )
  );

comment on table public.property_change_requests is
  'An owner asking for their unit''s max_guests / nightly_rate to be changed. The ask, never the change: applying one is an admin UPDATE on properties.';
comment on column public.property_change_requests.max_guests is
  'Requested sleeps-count, or null to leave it as it is.';
comment on column public.property_change_requests.nightly_rate is
  'Requested asking price per night, PKR, or null to leave it as it is. Never stack_rate - that is a deal term, not an asking price.';
comment on column public.property_change_requests.status is
  'pending until an admin rules: applied (properties was written) or declined (it was not).';
