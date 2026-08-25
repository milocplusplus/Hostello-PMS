-- Token receipts: proof screenshots for the advance that confirms a booking.
-- Two directions — the guest pays Hostello, and Hostello forwards the client's
-- share to the client. Both are evidence, so they are stored, not described.

create type public.booking_receipt_kind as enum ('guest_to_hostello', 'hostello_to_client');

create table public.booking_receipts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind public.booking_receipt_kind not null,
  storage_path text not null unique,
  amount numeric(12, 2),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index booking_receipts_booking_id_idx on public.booking_receipts (booking_id);

alter table public.booking_receipts enable row level security;

create policy "booking_receipts: admin full access" on public.booking_receipts
  for all using (public.is_admin());

create policy "booking_receipts: client reads own booking receipts" on public.booking_receipts
  for select using (
    exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_receipts.booking_id and c.owner_user_id = auth.uid()
    )
  );

create policy "booking_receipts: client attaches to own bookings" on public.booking_receipts
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_receipts.booking_id and c.owner_user_id = auth.uid()
    )
  );

-- Private bucket. Files are served through short-lived signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-receipts',
  'booking-receipts',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Objects live at <booking_id>/<uuid>.<ext>, so the first folder segment is the
-- ownership key.
create policy "booking receipts: admin full access" on storage.objects
  for all to authenticated
  using (bucket_id = 'booking-receipts' and public.is_admin())
  with check (bucket_id = 'booking-receipts' and public.is_admin());

create policy "booking receipts: client reads own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-receipts'
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where c.owner_user_id = auth.uid()
        and b.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "booking receipts: client uploads to own booking" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-receipts'
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where c.owner_user_id = auth.uid()
        and b.id::text = (storage.foldername(objects.name))[1]
    )
  );
