-- A host has no Hostello selling for them. A stay that comes through another host or a
-- dealer is its own source, shown as "Dealer booking". Pass-through in payout.ts (Hostello
-- earns nothing on a stay it did not sell).
-- Applied to the live DB as `booking_source_dealer` on 2026-10-21.
alter type public.booking_source add value if not exists 'dealer';
