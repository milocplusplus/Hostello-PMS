-- The second half of the money lockdown.
--
-- 20260906120000 closed reading the split and closed the four settlement flags.
-- It could not close *writing* the nine derived columns, because the booking
-- write paths computed the split in TypeScript and inserted it with the
-- caller's own JWT. A column grant is per Postgres role, and the owner, ops and
-- a property owner are all the same role — `authenticated` — so a grant wide
-- enough for the app to save a booking was a grant wide enough for an owner to
-- PATCH themselves a larger `client_payout`, which is what `loadOwed`
-- ("to_client") sums into the balance Hostello owes them.
--
-- The four booking write paths now write these columns with the service-role
-- key instead (`bookingWriter()` in src/lib/payout-inputs.ts). `payout.ts` is
-- unmoved and is still the only revenue math; only the credential changed.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ORDER MATTERS. Apply this only once the code that goes with it is deployed.
-- Until then `authenticated` still needs these grants and every booking save
-- depends on them. Applying this first takes booking creation down in both
-- portals for the whole window.
--
-- It also makes SUPABASE_SERVICE_ROLE_KEY a hard requirement for saving a
-- booking at all, where before it was only required for an ops login. It is set
-- in Vercel production; a deployment without it will refuse the save with a
-- message saying so rather than write a wrong figure.
-- ────────────────────────────────────────────────────────────────────────────

begin;

revoke insert (
  client_payout, deal_model_snapshot, deduct_percent_snapshot, hostello_share,
  net_sale, ota_model_snapshot, ota_share_percent_snapshot,
  share_percent_snapshot, stack_rate_snapshot
) on public.bookings from authenticated;

revoke update (
  client_payout, deal_model_snapshot, deduct_percent_snapshot, hostello_share,
  net_sale, ota_model_snapshot, ota_share_percent_snapshot,
  share_percent_snapshot, stack_rate_snapshot
) on public.bookings from authenticated;

-- After this, `authenticated` holds select, insert and update on the 23
-- ordinary columns and nothing whatsoever on the thirteen money columns —
-- the design context.md describes, finally true.
--
-- The non-money writes stay exactly as they were, under RLS with the caller's
-- own session: markStayProgress (checked_in_at / checked_out_at) and
-- cancelBooking (status) in both portals.

commit;
