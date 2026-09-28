-- ── Where channel emails go, and who is sending them ────────────────────────
--
-- The inbox address (Cloudflare Email Routing on Hostello's own domain, the
-- owner's choice 2026-09-29) and the email Hostello's Airbnb / Booking.com
-- account uses, which owners invite as co-host. Both are shown on the setup
-- guides in both portals, so a signed-in owner may read them; a visitor may
-- not. Until the address is set the inbox still says "coming soon".

alter table app_settings
  add column channel_inbox_address text,
  add column channel_cohost_email  text;

create or replace view app_settings_v with (security_invoker = false) as
 SELECT
        CASE
            WHEN is_admin() THEN app_settings.default_deal_model
            ELSE NULL::client_deal_model
        END AS default_deal_model,
        CASE
            WHEN is_admin() THEN app_settings.default_monthly_fee
            ELSE NULL::numeric
        END AS default_monthly_fee,
        CASE
            WHEN is_admin() THEN app_settings.default_share_percent
            ELSE NULL::numeric
        END AS default_share_percent,
        CASE
            WHEN is_admin() THEN app_settings.default_deduct_percent
            ELSE NULL::numeric
        END AS default_deduct_percent,
        CASE
            WHEN is_admin() THEN app_settings.default_ota_model
            ELSE NULL::client_ota_model
        END AS default_ota_model,
        CASE
            WHEN is_admin() THEN app_settings.default_ota_share_percent
            ELSE NULL::numeric
        END AS default_ota_share_percent,
        CASE
            WHEN s.signed_in THEN app_settings.checkin_time
            ELSE NULL::time without time zone
        END AS checkin_time,
        CASE
            WHEN s.signed_in THEN app_settings.checkout_time
            ELSE NULL::time without time zone
        END AS checkout_time,
        CASE
            WHEN s.signed_in THEN app_settings.short_stay_start
            ELSE NULL::time without time zone
        END AS short_stay_start,
        CASE
            WHEN s.signed_in THEN app_settings.short_stay_end
            ELSE NULL::time without time zone
        END AS short_stay_end,
        CASE
            WHEN s.signed_in THEN app_settings.default_booking_status
            ELSE NULL::text
        END AS default_booking_status,
        CASE
            WHEN s.signed_in THEN app_settings.ops_can_edit_prices
            ELSE NULL::boolean
        END AS ops_can_edit_prices,
        CASE
            WHEN s.signed_in THEN app_settings.ops_can_cancel
            ELSE NULL::boolean
        END AS ops_can_cancel,
        CASE
            WHEN s.signed_in THEN app_settings.ops_can_block
            ELSE NULL::boolean
        END AS ops_can_block,
    app_settings.business_name,
    app_settings.business_phone,
    app_settings.business_email,
    app_settings.business_address,
        CASE
            WHEN s.signed_in THEN app_settings.payment_accounts
            ELSE '[]'::jsonb
        END AS payment_accounts,
        CASE
            WHEN s.signed_in THEN app_settings.guest_templates
            ELSE '{}'::jsonb
        END AS guest_templates,
        CASE
            WHEN is_admin() THEN app_settings.owner_notices
            ELSE NULL::jsonb
        END AS owner_notices,
        CASE
            WHEN s.signed_in THEN app_settings.channel_inbox_address
            ELSE NULL::text
        END AS channel_inbox_address,
        CASE
            WHEN s.signed_in THEN app_settings.channel_cohost_email
            ELSE NULL::text
        END AS channel_cohost_email
   FROM app_settings
     CROSS JOIN LATERAL ( SELECT auth.uid() IS NOT NULL AS signed_in) s;

-- ── Per owner: are their channel emails arriving? ───────────────────────────
-- A mail belongs to the client of its unit, of the booking it found, or of the
-- unit its listing number / building names. `to_email` is the channel account
-- it was addressed to — for raw mail from the Cloudflare route, the original
-- To — which is how staff can tell whose forwarding it came through.

create function channel_intake_status()
returns table (client_id uuid, last_email_at timestamptz, emails_30d integer, accounts text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  return query
  with m as (
    select coalesce(
             p.client_id,
             b.client_id,
             (select p2.client_id from properties p2
               where p2.airbnb_listing_id = om.parsed ->> 'listing_id'
                  or p2.booking_hotel_id  = om.parsed ->> 'listing_id'
               limit 1)
           ) as client_id,
           om.received_at,
           nullif(lower(om.to_email), '') as to_email
      from ota_messages om
      left join properties p on p.id = om.property_id
      left join bookings b on b.id = om.booking_id
  )
  select m.client_id,
         max(m.received_at),
         (count(*) filter (where m.received_at > now() - interval '30 days'))::integer,
         coalesce(array_agg(distinct m.to_email) filter (where m.to_email is not null), '{}')
    from m
   where m.client_id is not null
   group by m.client_id;
end;
$fn$;

revoke execute on function channel_intake_status() from public, anon;
grant execute on function channel_intake_status() to authenticated;
