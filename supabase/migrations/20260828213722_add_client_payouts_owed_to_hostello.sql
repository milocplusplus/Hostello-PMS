-- Owed to Hostello ---------------------------------------------------------
--
-- A booking splits into two pots: hostello_share and client_payout. Whoever
-- collected the guest's money owes the other side their pot, so a booking has
-- two independent settlements, not one. `bookings.settled` used to be shown as
-- both at once -- "Mark received" on admin, "Paid out" on the owner's portal.
-- From here `settled` means only "the owner's payout has been sent", and the
-- new `share_received` means "Hostello's share is in hand". The backfill copies
-- `settled` across because the admin screens -- the only ones that wrote it --
-- meant it in the received direction.

alter table bookings
  add column if not exists share_received boolean not null default false,
  add column if not exists share_received_date date;

update bookings set share_received = settled, share_received_date = settled_date
where settled = true and share_received = false;

create index if not exists bookings_client_share_received_idx
  on bookings (client_id, share_received);

-- What the owner says they sent. Pending until an admin confirms it landed.
create table if not exists client_payouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('online', 'cash')),
  reference text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending', 'received', 'rejected')),
  admin_note text,
  submitted_by uuid references profiles(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An online transfer without proof is just a claim.
  constraint client_payouts_online_needs_receipt
    check (method <> 'online' or receipt_path is not null)
);

create index if not exists client_payouts_client_idx on client_payouts (client_id, created_at desc);
create index if not exists client_payouts_status_idx on client_payouts (status, created_at desc);

-- Which bookings a confirmed payment cleared, oldest stay first. One booking
-- can take money from several payments, which is what makes part-payment work.
create table if not exists client_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references client_payouts(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists client_payout_allocations_booking_idx
  on client_payout_allocations (booking_id);
create index if not exists client_payout_allocations_payout_idx
  on client_payout_allocations (payout_id);

alter table client_payouts enable row level security;
alter table client_payout_allocations enable row level security;

create policy "client_payouts: admin full access" on client_payouts
  for all using (is_admin()) with check (is_admin());

create policy "client_payouts: client reads own" on client_payouts
  for select using (exists (
    select 1 from clients c where c.id = client_payouts.client_id and c.owner_user_id = auth.uid()
  ));

-- An owner may only ever file a pending entry, never mark their own as received.
create policy "client_payouts: client files own" on client_payouts
  for insert with check (
    status = 'pending'
    and exists (
      select 1 from clients c where c.id = client_payouts.client_id and c.owner_user_id = auth.uid()
    )
  );

-- A rejected entry can be corrected and resubmitted; a received one is closed.
create policy "client_payouts: client fixes own unconfirmed" on client_payouts
  for update using (
    status in ('pending', 'rejected')
    and exists (
      select 1 from clients c where c.id = client_payouts.client_id and c.owner_user_id = auth.uid()
    )
  ) with check (
    status = 'pending'
    and exists (
      select 1 from clients c where c.id = client_payouts.client_id and c.owner_user_id = auth.uid()
    )
  );

create policy "client_payouts: client withdraws own pending" on client_payouts
  for delete using (
    status = 'pending'
    and exists (
      select 1 from clients c where c.id = client_payouts.client_id and c.owner_user_id = auth.uid()
    )
  );

create policy "client_payout_allocations: admin full access" on client_payout_allocations
  for all using (is_admin()) with check (is_admin());

create policy "client_payout_allocations: client reads own" on client_payout_allocations
  for select using (exists (
    select 1 from clients c where c.id = client_payout_allocations.client_id and c.owner_user_id = auth.uid()
  ));

-- Payment screenshots. Private, like booking receipts; the path's first segment
-- is the client id, which is what the storage policies key on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payout-receipts', 'payout-receipts', false, 8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- `objects.name`, never bare `name`: `clients` has a name column and an
-- unqualified reference silently binds to that one.
create policy "payout receipts: admin full access" on storage.objects
  for all to authenticated
  using (bucket_id = 'payout-receipts' and is_admin())
  with check (bucket_id = 'payout-receipts' and is_admin());

create policy "payout receipts: client reads own" on storage.objects
  for select to authenticated
  using (bucket_id = 'payout-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));

create policy "payout receipts: client uploads own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payout-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));

create policy "payout receipts: client replaces own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payout-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));
