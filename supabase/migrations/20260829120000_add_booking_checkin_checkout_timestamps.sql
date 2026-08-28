-- Check-in / check-out ticks for the day sheet.
--
-- These record that the *arrival was handled*, not when the stay is booked for
-- — `check_in` / `check_out` already say that. Null means not yet done, which
-- is what lets /admin/today and /client/today empty themselves as the day goes.
--
-- No RLS changes needed: the bookings policies are already ALL-scoped (admins
-- see everything, an owner sees rows for their own client), so both portals can
-- write these two columns on the rows they can already write.

alter table public.bookings
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

comment on column public.bookings.checked_in_at is
  'When the guest was marked arrived on the day sheet. Null = not yet. Records that the arrival was handled, not the contractual check_in date.';

comment on column public.bookings.checked_out_at is
  'When the guest was marked departed on the day sheet. Null = not yet. Records that the departure was handled, not the contractual check_out date.';
