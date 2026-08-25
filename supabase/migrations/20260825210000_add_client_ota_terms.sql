-- Per-client terms for OTA-sourced bookings (Airbnb / Booking.com).
-- Hostello earns nothing on these for some clients; for others it takes a
-- percentage or the stack-rate spread, independent of the base deal model.
create type public.client_ota_model as enum ('none', 'percent', 'stack');

alter table public.clients
  add column ota_model public.client_ota_model not null default 'percent',
  add column ota_share_percent numeric not null default 0;

-- Existing clients keep behaving exactly as they did: OTA bookings followed
-- the base deal model before this column existed.
update public.clients
set ota_model = case deal_model
      when 'percent' then 'percent'
      when 'fixed_percent' then 'percent'
      when 'ads' then 'stack'
      when 'fixed_stack' then 'stack'
      when 'fixed' then 'none'
    end::public.client_ota_model,
    ota_share_percent = share_percent;

-- Snapshot the OTA terms onto the booking, like the other deal terms.
-- Nullable: bookings written before this migration have no OTA snapshot.
alter table public.bookings
  add column ota_model_snapshot public.client_ota_model,
  add column ota_share_percent_snapshot numeric;
