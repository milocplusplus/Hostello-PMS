-- ── A booking priced in another currency ────────────────────────────────────
--
-- Airbnb quotes many listings in USD; `payout.ts` is PKR throughout. The inbox
-- converts at the market rate when a reservation is approved, and keeps what
-- it converted from, so the figure can be worked out again at the check-in
-- day's rate (the owner's choice, 2026-09-28: provisional until check-in,
-- re-converted by a one-tap list, owner told through the ordinary booking
-- update). Airbnb pays out in PKR at its own rate, so either figure is an
-- estimate of what lands in the bank — the later one is the closer.
--
-- `sale_price` stays the only price anything computes from. These columns are
-- its provenance, never a second source of money.

alter table bookings
  add column original_currency text,
  add column original_amount   numeric(12, 2),
  -- PKR per one unit of `original_currency`, as applied: sale_price / original_amount.
  add column fx_rate           numeric(12, 4),
  add column fx_rate_on        date,
  -- Still at a rate from before check-in, so due to be re-converted. Cleared by
  -- re-converting, by keeping the rate, or by a price typed in by hand.
  add column fx_provisional    boolean not null default false;

comment on column bookings.original_amount is
  'What the channel quoted, in original_currency, before conversion to sale_price (PKR).';

-- Written only with the server's own key (see `bookingWriter`), like the rest
-- of the price; read through the view. No grant to `authenticated` needed.

create or replace view bookings_v with (security_invoker = false) as
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
    nightly_price,
    original_currency,
    original_amount,
    fx_rate,
    fx_rate_on,
    fx_provisional
   FROM bookings b
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE c.id = b.client_id AND c.owner_user_id = auth.uid()));

-- ── Telling the admin a re-conversion is due ────────────────────────────────
-- Once, on the morning of check-in (or the first run after), for each stay
-- still at its booking-day rate. Nothing converts on its own: the owner chose
-- a one-tap list, in the channel inbox.

create function notify_fx_due()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_n integer;
begin
  insert into notifications (kind, category, audience, title, body, client_id, booking_id, event_key)
  select 'ota_fx_due', 'payment', 'admin',
         'Re-convert ' || coalesce(b.guest_name, 'a stay') || '''s price',
         'Checked in ' || to_char(b.check_in, 'DD Mon') || ' · priced at ' ||
           b.original_currency || ' ' || b.original_amount || ' × ' || b.fx_rate ||
           ' from ' || to_char(b.fx_rate_on, 'DD Mon') ||
           '. Re-convert it at today''s rate in the channel inbox.',
         b.client_id, b.id, 'fx-due:' || b.id
    from bookings b
   where b.fx_provisional
     and b.status <> 'cancelled'
     and b.check_in <= current_date
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke execute on function notify_fx_due() from public, anon, authenticated;

-- 02:20 UTC = 07:20 Karachi, after the morning's arrivals notice.
select cron.schedule('hostello-fx-due', '20 2 * * *', 'select public.notify_fx_due();');
