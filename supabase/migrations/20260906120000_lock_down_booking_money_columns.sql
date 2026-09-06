-- Re-close the money columns on `bookings`.
--
-- The design was already right: 23 non-money columns carry a column-level
-- SELECT grant and the thirteen money columns carry none, so `bookings_v` is
-- the only way to read a split. But `bookings` also carried a *table-level*
-- grant of insert/select/update/delete to `authenticated`, and privileges are
-- a union — the table grant won and the column ACLs were decoration.
--
-- Two things followed from that, both contradicting rules the app is built on:
--   * ops could read hostello_share / client_payout / net_sale straight off
--     /rest/v1/bookings, so `canSeeSplit` was a UI convention only;
--   * an owner could PATCH settled / share_received on their own bookings,
--     closing a balance with no confirmed payment behind it.
--
-- The base table is write-only in the application — every read already goes
-- through bookings_v — so removing SELECT on it costs nothing.

begin;

-- ── 1. The one app path that wrote a settlement flag directly ───────────────
--
-- `markShareReceived` is the documented exception: Hostello kept its share out
-- of money it already held, so no payment has to move and the owner has nothing
-- to send. It was a direct UPDATE from a Server Action, which is why
-- `authenticated` needed UPDATE on share_received — and why an owner's session
-- could use the same grant on their own bookings.
--
-- Moving it behind SECURITY DEFINER lets the grant go. Same rule as every other
-- settlement write: the database decides, not the caller.
create or replace function public.set_share_received(
  p_booking_id uuid,
  p_received boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only the owner can close a share directly';
  end if;

  update bookings
  set share_received = p_received,
      share_received_date = case when p_received then current_date else null end,
      updated_at = now()
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;
end;
$$;

-- A fresh function keeps a PUBLIC grant that anon inherits; revoking from anon
-- alone is a no-op. Name both, then grant back explicitly.
revoke execute on function public.set_share_received(uuid, boolean) from public, anon;
grant execute on function public.set_share_received(uuid, boolean) to authenticated, service_role;

-- ── 2. Drop the blanket grants ─────────────────────────────────────────────
revoke all on public.bookings from authenticated, anon;

-- ── 3. Read: the 23 non-money columns, and nothing else ────────────────────
grant select (
  advance_received, check_in, check_out, checked_in_at, checked_out_at,
  client_id, created_at, entered_by, expected_arrival, expected_departure,
  guest_name, guest_phone, guests_count, id, is_short_stay, notes, ota_ref,
  sale_price, short_stay_end, short_stay_start, source, status, updated_at
) on public.bookings to authenticated;

-- ── 4. Write: the same 23, plus the nine derived columns the create and edit
--         paths compute with calculatePayout() and write from the session.
--         Writable but never readable — that is what column grants are for.
grant insert (
  advance_received, check_in, check_out, checked_in_at, checked_out_at,
  client_id, created_at, entered_by, expected_arrival, expected_departure,
  guest_name, guest_phone, guests_count, id, is_short_stay, notes, ota_ref,
  sale_price, short_stay_end, short_stay_start, source, status, updated_at,
  client_payout, deal_model_snapshot, deduct_percent_snapshot, hostello_share,
  net_sale, ota_model_snapshot, ota_share_percent_snapshot,
  share_percent_snapshot, stack_rate_snapshot
) on public.bookings to authenticated;

grant update (
  advance_received, check_in, check_out, checked_in_at, checked_out_at,
  client_id, created_at, entered_by, expected_arrival, expected_departure,
  guest_name, guest_phone, guests_count, id, is_short_stay, notes, ota_ref,
  sale_price, short_stay_end, short_stay_start, source, status, updated_at,
  client_payout, deal_model_snapshot, deduct_percent_snapshot, hostello_share,
  net_sale, ota_model_snapshot, ota_share_percent_snapshot,
  share_percent_snapshot, stack_rate_snapshot
) on public.bookings to authenticated;

-- settled, settled_date, share_received, share_received_date get no grant at
-- all. The apply_/revoke_ payout RPCs and set_share_received above are
-- SECURITY DEFINER and run as the owner, so they are unaffected — and they are
-- now the only way these four can change.

-- Deleting a client cascades to its bookings; referential actions run as the
-- table owner and do not need this, but the admin delete path is kept working
-- as it was rather than changed inside a security fix.
grant delete on public.bookings to authenticated;

-- anon gets nothing. It held insert/update/delete here, blocked only by RLS.

-- ── 5. The views are read paths, not write paths ───────────────────────────
--
-- All three are simple enough for Postgres to treat as auto-updatable, and they
-- are security_invoker = false — so a write through one runs as the view owner
-- and RLS never fires. The money columns are CASE expressions and so are not
-- updatable, but guest_name, sale_price and status are, and the app never
-- writes to a view: "read money from the views; write to the base tables".
revoke insert, update, delete on public.bookings_v from authenticated, anon;
revoke insert, update, delete on public.clients_v from authenticated, anon;
revoke insert, update, delete on public.properties_v from authenticated, anon;

commit;
