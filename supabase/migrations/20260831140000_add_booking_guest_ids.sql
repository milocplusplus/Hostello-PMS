-- Guest ID cards: the CNIC / passport scans that go with a stay. A booking can
-- carry several — one per guest, or a front and a back — so this is a plain
-- child table with no kind and no amount, unlike `booking_receipts`.
--
-- Unlike receipts, **both sides upload here.** Collecting the guest's ID is the
-- job of whoever met the guest, and on a self-sourced booking that is the owner.

create table public.booking_guest_ids (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  storage_path text not null unique,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index booking_guest_ids_booking_id_idx on public.booking_guest_ids (booking_id);

alter table public.booking_guest_ids enable row level security;

create policy "booking_guest_ids: admin full access" on public.booking_guest_ids
  for all using (public.is_admin());

create policy "booking_guest_ids: client reads own" on public.booking_guest_ids
  for select using (
    exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_guest_ids.booking_id and c.owner_user_id = (select auth.uid())
    )
  );

create policy "booking_guest_ids: client attaches to own bookings" on public.booking_guest_ids
  for insert with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_guest_ids.booking_id and c.owner_user_id = (select auth.uid())
    )
  );

-- An owner can take back a scan they attached by mistake; they cannot remove
-- one Hostello put there.
create policy "booking_guest_ids: client removes own uploads" on public.booking_guest_ids
  for delete using (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_guest_ids.booking_id and c.owner_user_id = (select auth.uid())
    )
  );

-- Private bucket. ID documents never reach a browser except through a
-- short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-ids',
  'guest-ids',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Objects live at <booking_id>/<uuid>.<ext>, so the first folder segment is the
-- ownership key. `objects.name` is qualified deliberately: `clients` has a
-- `name` column and a bare `name` would bind to it.
create policy "guest ids: admin full access" on storage.objects
  for all to authenticated
  using (bucket_id = 'guest-ids' and public.is_admin())
  with check (bucket_id = 'guest-ids' and public.is_admin());

create policy "guest ids: client reads own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'guest-ids'
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where c.owner_user_id = (select auth.uid())
        and b.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "guest ids: client uploads to own booking" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guest-ids'
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where c.owner_user_id = (select auth.uid())
        and b.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "guest ids: client deletes own booking's files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'guest-ids'
    and exists (
      select 1
      from public.bookings b
      join public.clients c on c.id = b.client_id
      where c.owner_user_id = (select auth.uid())
        and b.id::text = (storage.foldername(objects.name))[1]
    )
  );
