-- Token receipts are Hostello's record: staff upload them, the client reads the
-- ones on their own bookings. Drops the upload policies added alongside the
-- table so the client portal has no write path at all.
drop policy if exists "booking_receipts: client attaches to own bookings" on public.booking_receipts;
drop policy if exists "booking receipts: client uploads to own booking" on storage.objects;
