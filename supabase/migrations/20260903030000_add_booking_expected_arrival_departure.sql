-- When the guest actually turns up ------------------------------------------
--
-- `check_in` is the date the stay is booked for; it says nothing about whether
-- they land at 2pm or 2am, which is exactly what the person meeting them needs
-- to know. Nullable: null means "they have not told us", which the UI says
-- rather than guessing a standard time.
--
-- A short stay already carries its own window in short_stay_start/end, and that
-- window is the arrival — these two are for ordinary night bookings, and the
-- form hides them when the short-stay toggle is on.

alter table public.bookings
  add column if not exists expected_arrival time,
  add column if not exists expected_departure time;

-- Grants on `bookings` are column-level, not table-level, so a new column
-- arrives with nothing and has to be granted explicitly. These are operational,
-- not money: ops needs them, so they get SELECT unlike hostello_share.
grant select, insert, update, references (expected_arrival, expected_departure)
  on public.bookings to authenticated;
grant select, insert, update, references (expected_arrival, expected_departure)
  on public.bookings to service_role;

-- `bookings_v` is how the money is read, and it is also now how these are read.
-- Passed through unmasked -- an arrival time is not a split. Recreated rather
-- than altered because a view does not pick up new base-table columns; the
-- masking CASEs and the WHERE clause below are unchanged from the previous
-- definition, and `security_invoker = false` is restated because that is what
-- makes the WHERE clause the access rule rather than RLS.
create or replace view public.bookings_v
with (security_invoker = false) as
 SELECT id, client_id, guest_name, guest_phone, guests_count, check_in,
    check_out, source, status, sale_price, advance_received,
    CASE WHEN NOT is_ops() THEN deal_model_snapshot ELSE NULL::client_deal_model END AS deal_model_snapshot,
    CASE WHEN NOT is_ops() THEN share_percent_snapshot ELSE NULL::numeric END AS share_percent_snapshot,
    CASE WHEN NOT is_ops() THEN deduct_percent_snapshot ELSE NULL::numeric END AS deduct_percent_snapshot,
    CASE WHEN NOT is_ops() THEN stack_rate_snapshot ELSE NULL::numeric END AS stack_rate_snapshot,
    CASE WHEN NOT is_ops() THEN net_sale ELSE NULL::numeric END AS net_sale,
    CASE WHEN NOT is_ops() THEN hostello_share ELSE NULL::numeric END AS hostello_share,
    CASE WHEN NOT is_ops() THEN client_payout ELSE NULL::numeric END AS client_payout,
    CASE WHEN NOT is_ops() THEN settled ELSE NULL::boolean END AS settled,
    CASE WHEN NOT is_ops() THEN settled_date ELSE NULL::date END AS settled_date,
    CASE WHEN NOT is_ops() THEN ota_model_snapshot ELSE NULL::client_ota_model END AS ota_model_snapshot,
    CASE WHEN NOT is_ops() THEN ota_share_percent_snapshot ELSE NULL::numeric END AS ota_share_percent_snapshot,
    CASE WHEN NOT is_ops() THEN share_received ELSE NULL::boolean END AS share_received,
    CASE WHEN NOT is_ops() THEN share_received_date ELSE NULL::date END AS share_received_date,
    notes, entered_by, created_at, updated_at, checked_in_at, checked_out_at,
    is_short_stay, short_stay_start, short_stay_end, ota_ref,
    expected_arrival, expected_departure
   FROM bookings b
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE c.id = b.client_id AND c.owner_user_id = auth.uid()));
