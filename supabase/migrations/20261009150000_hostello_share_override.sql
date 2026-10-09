-- What Hostello earns on one booking, when the admin typed it instead of
-- taking the deal's figure. Null = calculated from the deal. `payout.ts` reads
-- it; a later change to the stay's price or dates clears it (booking-price.ts).

alter table public.bookings
  add column hostello_share_override numeric
    check (hostello_share_override is null or hostello_share_override >= 0);

-- Money, like the rest of the split: no grant on the base table; read through
-- the view, written by the booking writer.
create or replace view public.bookings_v with (security_invoker = false) as
 select id,
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
    case when not is_ops() then deal_model_snapshot else null::client_deal_model end as deal_model_snapshot,
    case when not is_ops() then share_percent_snapshot else null::numeric end as share_percent_snapshot,
    case when not is_ops() then deduct_percent_snapshot else null::numeric end as deduct_percent_snapshot,
    case when not is_ops() then stack_rate_snapshot else null::numeric end as stack_rate_snapshot,
    case when not is_ops() then net_sale else null::numeric end as net_sale,
    case when not is_ops() then hostello_share else null::numeric end as hostello_share,
    case when not is_ops() then client_payout else null::numeric end as client_payout,
    case when not is_ops() then settled else null::boolean end as settled,
    case when not is_ops() then settled_date else null::date end as settled_date,
    case when not is_ops() then ota_model_snapshot else null::client_ota_model end as ota_model_snapshot,
    case when not is_ops() then ota_share_percent_snapshot else null::numeric end as ota_share_percent_snapshot,
    case when not is_ops() then share_received else null::boolean end as share_received,
    case when not is_ops() then share_received_date else null::date end as share_received_date,
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
    fx_provisional,
    advance_received_by,
    balance_received_by,
    case when not is_ops() then due_to_client else null::numeric end as due_to_client,
    case when not is_ops() then due_to_hostello else null::numeric end as due_to_hostello,
    case when not is_ops() then hostello_share_override else null::numeric end as hostello_share_override
   from bookings b
  where is_staff() or (exists ( select 1
           from clients c
          where c.id = b.client_id and c.owner_user_id = auth.uid()));
