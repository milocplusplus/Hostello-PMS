-- Owed to Client -----------------------------------------------------------
--
-- The other direction of settlement: money Hostello sends the property owner.
--
-- `client_payouts` is what an owner says they sent Hostello, confirmed by an
-- admin. This is its mirror -- what Hostello says it sent the owner, confirmed
-- by the owner. Only that confirmation closes a booking's `settled` flag, so
-- the two flags stay what they have always been: opposite directions, each set
-- by whoever actually received the money. Nothing sets `settled` from a
-- booking screen any more.

create table public.hostello_payouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null check (method in ('online', 'cash')),
  reference text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending', 'received', 'rejected')),
  -- The owner's reason when they say it never arrived. Mirrors `admin_note`.
  client_note text,
  sent_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hostello_payouts_client_status_idx on public.hostello_payouts (client_id, status);

create table public.hostello_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.hostello_payouts(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index hostello_payout_allocations_booking_idx on public.hostello_payout_allocations (booking_id);
create index hostello_payout_allocations_client_idx on public.hostello_payout_allocations (client_id);

alter table public.hostello_payouts enable row level security;
alter table public.hostello_payout_allocations enable row level security;

-- Hostello writes these; the owner only reads them. Every write an owner makes
-- (confirm, reject) goes through an RPC in the next migration, so there is no
-- client UPDATE policy to get the columns wrong through.
create policy "hostello_payouts: admin full access"
  on public.hostello_payouts for all using (is_admin()) with check (is_admin());

create policy "hostello_payouts: client reads own"
  on public.hostello_payouts for select using (
    exists (select 1 from public.clients c
             where c.id = hostello_payouts.client_id and c.owner_user_id = auth.uid())
  );

create policy "hostello_payout_allocations: admin full access"
  on public.hostello_payout_allocations for all using (is_admin()) with check (is_admin());

create policy "hostello_payout_allocations: client reads own"
  on public.hostello_payout_allocations for select using (
    exists (select 1 from public.clients c
             where c.id = hostello_payout_allocations.client_id and c.owner_user_id = auth.uid())
  );

-- Its own bucket, not `payout-receipts`. That one lets an owner write and
-- delete inside their folder, which is right for their own screenshots and
-- wrong for Hostello's proof of payment -- the owner must not be able to remove
-- the evidence they are being asked to confirm.
insert into storage.buckets (id, name, public)
values ('hostello-payout-receipts', 'hostello-payout-receipts', false)
on conflict (id) do nothing;

create policy "hostello payout receipts: admin full access"
  on storage.objects for all to authenticated
  using (bucket_id = 'hostello-payout-receipts' and is_admin())
  with check (bucket_id = 'hostello-payout-receipts' and is_admin());

-- `objects.name`, never bare `name`: `clients` has a name column and an
-- unqualified reference binds to it, denying everything.
create policy "hostello payout receipts: client reads own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'hostello-payout-receipts'
    and exists (
      select 1 from public.clients c
       where c.owner_user_id = auth.uid()
         and c.id::text = (storage.foldername(objects.name))[1]
    )
  );
