-- Database-side performance pass.
--
-- 1. `auth.uid()` written bare inside a policy is re-evaluated once per row.
--    Wrapping it in a scalar subquery turns it into an InitPlan that Postgres
--    evaluates once per statement. Same semantics, same rows — this is the fix
--    Supabase's `auth_rls_initplan` linter asks for. ALTER POLICY edits in
--    place, so no policy is ever briefly missing.
--
-- 2. Five foreign keys had no covering index, which makes the join (and any
--    cascade) a sequential scan.

-- ── 1. RLS init plans ───────────────────────────────────────────────────────

alter policy "clients: owner reads own record" on public.clients
  using (owner_user_id = (select auth.uid()));

alter policy "profiles: read own or admin reads all" on public.profiles
  using (((select auth.uid()) = id) or is_admin());

alter policy "properties: client reads own properties" on public.properties
  using (exists (
    select 1 from clients c
    where c.id = properties.client_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "payout_rules: client reads own property rules" on public.payout_rules
  using (exists (
    select 1 from properties pr
    join clients c on c.id = pr.client_id
    where pr.id = payout_rules.property_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "bookings: client reads and writes own bookings" on public.bookings
  using (exists (
    select 1 from clients c
    where c.id = bookings.client_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "booking_properties: client reads own booking's properties" on public.booking_properties
  using (exists (
    select 1 from bookings b
    join clients c on c.id = b.client_id
    where b.id = booking_properties.booking_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "booking_properties: client inserts own booking's properties" on public.booking_properties
  with check (
    exists (
      select 1 from bookings b
      join clients c on c.id = b.client_id
      where b.id = booking_properties.booking_id and c.owner_user_id = (select auth.uid())
    )
    and exists (
      select 1 from properties pr
      join clients c on c.id = pr.client_id
      where pr.id = booking_properties.property_id and c.owner_user_id = (select auth.uid())
    )
  );

alter policy "calendar_blocks: client reads own property blocks" on public.calendar_blocks
  using (exists (
    select 1 from properties pr
    join clients c on c.id = pr.client_id
    where pr.id = calendar_blocks.property_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "calendar_blocks: client manages own property blocks" on public.calendar_blocks
  with check (exists (
    select 1 from properties pr
    join clients c on c.id = pr.client_id
    where pr.id = calendar_blocks.property_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "calendar_blocks: client deletes own property blocks" on public.calendar_blocks
  using (exists (
    select 1 from properties pr
    join clients c on c.id = pr.client_id
    where pr.id = calendar_blocks.property_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "notifications: client reads own" on public.notifications
  using (exists (
    select 1 from clients c
    where c.id = notifications.client_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "notifications: client marks own as read" on public.notifications
  using (exists (
    select 1 from clients c
    where c.id = notifications.client_id and c.owner_user_id = (select auth.uid())
  ));

alter policy "booking_receipts: client reads own booking receipts" on public.booking_receipts
  using (exists (
    select 1 from bookings b
    join clients c on c.id = b.client_id
    where b.id = booking_receipts.booking_id and c.owner_user_id = (select auth.uid())
  ));

-- ── 2. Covering indexes for the unindexed foreign keys ──────────────────────

create index if not exists idx_booking_receipts_uploaded_by
  on public.booking_receipts (uploaded_by);

create index if not exists idx_bookings_entered_by
  on public.bookings (entered_by);

create index if not exists idx_calendar_blocks_created_by
  on public.calendar_blocks (created_by);

create index if not exists idx_notifications_booking_id
  on public.notifications (booking_id);

create index if not exists idx_notifications_property_id
  on public.notifications (property_id);
