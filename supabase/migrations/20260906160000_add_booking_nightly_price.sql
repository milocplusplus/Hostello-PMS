-- Price a stay per night, not only as a total.
--
-- `sale_price` stays exactly what it was: the gross total, the only figure any
-- query, `payout.ts`, `owed.ts`, Stats or the settlements engine reads. Nothing
-- downstream learns a new concept and there is no second revenue system.
--
-- `nightly_price` records *how that total was reached*. Null means it was typed
-- as a total, which is every row that exists today. Non-null means it was typed
-- per night, and `sale_price = nightly_price × nights` — which is what lets an
-- edit reopen the way it was entered, and lets a date change re-multiply
-- instead of leaving a total that no longer matches the nights.
--
-- It is an asking price, the same class of figure as `sale_price` and
-- `properties.nightly_rate` — what a guest is quoted. So it is NOT masked for
-- ops and NOT behind canSeeSplit: ops takes the money at the door.
--
-- Safe to apply before the code that uses it: the column is nullable and
-- nothing writes it until then.

begin;

alter table public.bookings
  add column if not exists nightly_price numeric;

comment on column public.bookings.nightly_price is
  'Per-night rate when the stay was priced that way; null when a total was entered. sale_price is always the total either way.';

-- A new column on `bookings` arrives with no privileges at all — grants here are
-- column-level, not table-level. Mirror `sale_price` exactly.
grant select (nightly_price), insert (nightly_price), update (nightly_price)
  on public.bookings to authenticated;

-- A view does not pick up new base-table columns. `create or replace view` can
-- only append, so it goes at the end rather than beside sale_price, and
-- `security_invoker = false` has to be restated or the WHERE clause stops being
-- the access rule.
create or replace view public.bookings_v
with (security_invoker = false) as
 SELECT id,
    client_id,
    guest_name,
    guest_phone,
    guests_count,
    check_in,
    check_out,
    source,
    status,
    sale_price,
    advance_received,
        CASE
            WHEN NOT is_ops() THEN deal_model_snapshot
            ELSE NULL::client_deal_model
        END AS deal_model_snapshot,
        CASE
            WHEN NOT is_ops() THEN share_percent_snapshot
            ELSE NULL::numeric
        END AS share_percent_snapshot,
        CASE
            WHEN NOT is_ops() THEN deduct_percent_snapshot
            ELSE NULL::numeric
        END AS deduct_percent_snapshot,
        CASE
            WHEN NOT is_ops() THEN stack_rate_snapshot
            ELSE NULL::numeric
        END AS stack_rate_snapshot,
        CASE
            WHEN NOT is_ops() THEN net_sale
            ELSE NULL::numeric
        END AS net_sale,
        CASE
            WHEN NOT is_ops() THEN hostello_share
            ELSE NULL::numeric
        END AS hostello_share,
        CASE
            WHEN NOT is_ops() THEN client_payout
            ELSE NULL::numeric
        END AS client_payout,
        CASE
            WHEN NOT is_ops() THEN settled
            ELSE NULL::boolean
        END AS settled,
        CASE
            WHEN NOT is_ops() THEN settled_date
            ELSE NULL::date
        END AS settled_date,
        CASE
            WHEN NOT is_ops() THEN ota_model_snapshot
            ELSE NULL::client_ota_model
        END AS ota_model_snapshot,
        CASE
            WHEN NOT is_ops() THEN ota_share_percent_snapshot
            ELSE NULL::numeric
        END AS ota_share_percent_snapshot,
        CASE
            WHEN NOT is_ops() THEN share_received
            ELSE NULL::boolean
        END AS share_received,
        CASE
            WHEN NOT is_ops() THEN share_received_date
            ELSE NULL::date
        END AS share_received_date,
    notes,
    entered_by,
    created_at,
    updated_at,
    checked_in_at,
    checked_out_at,
    is_short_stay,
    short_stay_start,
    short_stay_end,
    ota_ref,
    expected_arrival,
    expected_departure,
    nightly_price
   FROM bookings b
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE c.id = b.client_id AND c.owner_user_id = auth.uid()));

-- Recreating the view resets its grants: reads yes, writes no (20260906120000).
revoke insert, update, delete on public.bookings_v from authenticated, anon;
grant select on public.bookings_v to authenticated, service_role;

commit;
