-- Host mode, phase 6: what happens when a trial ends or a plan is not renewed, and
-- what is kept when a host deletes their account.
-- Applied to the live DB as `host_lifecycle` on 2026-10-18.

-- 1. Over the plan limit must not stop a host editing a unit they already have active.
create or replace function public.enforce_host_unit_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_max integer;
  v_status text;
  v_count integer;
begin
  if new.status::text <> 'active' then return new; end if;
  -- Saving an active unit that stays active (and stays theirs) adds nothing.
  if tg_op = 'UPDATE' and old.status::text = 'active' and old.client_id = new.client_id then
    return new;
  end if;
  select account_type into v_type from clients where id = new.client_id;
  if v_type is distinct from 'host' then return new; end if;

  select p.max_listings, s.status into v_max, v_status
  from subscriptions s join plans p on p.key = s.plan_key
  where s.client_id = new.client_id;
  if v_max is null then
    raise exception 'This account has no plan, so no listing can be added.';
  end if;
  if v_status in ('read_only', 'paused') then
    raise exception 'This account is % and cannot add listings.', replace(v_status, '_', ' ');
  end if;

  select count(*) into v_count from properties
  where client_id = new.client_id and status::text = 'active' and id <> new.id;
  if v_count >= v_max then
    raise exception 'Your plan allows % listings. Upgrade to add more.', v_max;
  end if;
  return new;
end $$;

-- 2. When the lapse began, so "read-only for 14 days, then paused" has a clock.
alter table public.subscriptions add column lapsed_at timestamptz;

create or replace function public.subscriptions_track_lapse() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'read_only' and old.status is distinct from 'read_only' then
    new.lapsed_at := now();
  elsif new.status not in ('read_only', 'paused') then
    new.lapsed_at := null;
  end if;
  return new;
end $$;
create trigger subscriptions_track_lapse before update on public.subscriptions
  for each row execute function public.subscriptions_track_lapse();

-- 3. Read-only means read-only: a host whose plan has lapsed cannot change their own
--    records. Only the host themself is stopped. Jobs and the sync (no acting user)
--    and the admin (not the owner) pass, so nothing batch-wide can fail on one host.
create or replace function public.refuse_when_host_locked() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(new);
  v_actor uuid := audit_uid();
  v_client uuid;
  v_status text;
begin
  if v_actor is null then return new; end if;
  -- A date block that came from a channel calendar is the sync's, not the host's.
  if tg_table_name = 'calendar_blocks' and v_row ->> 'feed_id' is not null then return new; end if;

  v_client := coalesce(
    (v_row ->> 'client_id')::uuid,
    (select client_id from properties where id = (v_row ->> 'property_id')::uuid),
    (select client_id from bookings where id = (v_row ->> 'booking_id')::uuid)
  );

  select s.status into v_status
  from subscriptions s join clients c on c.id = s.client_id
  where c.id = v_client and c.account_type = 'host' and c.owner_user_id = v_actor;

  if v_status = 'read_only' then
    raise exception 'Your plan has lapsed, so your account is read-only. Contact Hostello to renew.';
  elsif v_status = 'paused' then
    raise exception 'Your account is paused. Contact Hostello to bring it back.';
  end if;
  return new;
end $$;
revoke execute on function public.refuse_when_host_locked() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'booking_properties', 'booking_payments', 'properties', 'calendar_feeds',
                           'calendar_exports', 'calendar_blocks', 'expenses', 'recurring_expenses',
                           'expense_budgets', 'property_photos']
  loop
    execute format(
      'create trigger host_locked before insert or update on public.%I for each row execute function public.refuse_when_host_locked()', t);
  end loop;
end $$;

-- 4. The daily pass: trial over -> read-only, plan unpaid -> read-only, two weeks
--    read-only -> paused; and one reminder three days before either end.
--    A comped host never lapses on its own.
create or replace function public.run_host_lifecycle() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_trial_ended int := 0;
  v_overdue int := 0;
  v_paused int := 0;
  v_trial_soon int := 0;
  v_pay_soon int := 0;
  v_n int;
begin
  for r in
    with moved as (
      update subscriptions s set status = 'read_only'
      from clients c
      where c.id = s.client_id and c.account_type = 'host' and not s.comped
        and s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at < now()
      returning s.client_id)
    select client_id from moved
  loop
    v_trial_ended := v_trial_ended + 1;
    insert into notifications (kind, category, audience, title, body, client_id, event_key)
    values ('host_trial_ended', 'system', 'client', 'Your free trial has ended',
            'Your account is now read-only and your data is kept. Contact Hostello to choose a plan.',
            r.client_id, 'host_trial_ended:' || r.client_id)
    on conflict (event_key) where event_key is not null do nothing;
  end loop;

  for r in
    with moved as (
      update subscriptions s set status = 'read_only'
      from clients c
      where c.id = s.client_id and c.account_type = 'host' and not s.comped
        and s.status = 'active' and s.current_period_end is not null and s.current_period_end < now()
      returning s.client_id, s.current_period_end)
    select client_id, current_period_end from moved
  loop
    v_overdue := v_overdue + 1;
    insert into notifications (kind, category, audience, title, body, client_id, event_key)
    values ('host_payment_overdue', 'payment', 'client', 'Your plan has expired',
            'Your account is now read-only and your data is kept. Contact Hostello to renew.',
            r.client_id, 'host_payment_overdue:' || r.client_id || ':' || r.current_period_end::date)
    on conflict (event_key) where event_key is not null do nothing;
  end loop;

  for r in
    with moved as (
      update subscriptions s set status = 'paused'
      from clients c
      where c.id = s.client_id and c.account_type = 'host' and not s.comped
        and s.status = 'read_only' and s.lapsed_at is not null and s.lapsed_at < now() - interval '14 days'
      returning s.client_id, s.lapsed_at)
    select client_id, lapsed_at from moved
  loop
    v_paused := v_paused + 1;
    insert into notifications (kind, category, audience, title, body, client_id, event_key)
    values ('host_paused', 'system', 'client', 'Your account is paused',
            'Your calendars have stopped syncing. Your data is kept; contact Hostello to bring the account back.',
            r.client_id, 'host_paused:' || r.client_id || ':' || r.lapsed_at::date)
    on conflict (event_key) where event_key is not null do nothing;
  end loop;

  insert into notifications (kind, category, audience, title, body, client_id, event_key)
  select 'host_trial_ending', 'system', 'client',
         case when ceil(extract(epoch from (s.trial_ends_at - now())) / 86400) <= 1
              then 'Your free trial ends tomorrow'
              else 'Your free trial ends in ' || ceil(extract(epoch from (s.trial_ends_at - now())) / 86400)::int || ' days' end,
         'Contact Hostello to choose a plan so your account stays open.',
         s.client_id, 'host_trial_ending:' || s.client_id || ':' || s.trial_ends_at::date
  from subscriptions s join clients c on c.id = s.client_id
  where c.account_type = 'host' and not s.comped and s.status = 'trial'
    and s.trial_ends_at between now() and now() + interval '3 days'
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;
  v_trial_soon := v_n;

  insert into notifications (kind, category, audience, title, body, client_id, event_key)
  select 'host_payment_due', 'payment', 'client',
         case when ceil(extract(epoch from (s.current_period_end - now())) / 86400) <= 1
              then 'Your plan renews tomorrow'
              else 'Your plan runs out in ' || ceil(extract(epoch from (s.current_period_end - now())) / 86400)::int || ' days' end,
         'Contact Hostello to renew so your account stays open.',
         s.client_id, 'host_payment_due:' || s.client_id || ':' || s.current_period_end::date
  from subscriptions s join clients c on c.id = s.client_id
  where c.account_type = 'host' and not s.comped and s.status = 'active'
    and s.current_period_end between now() and now() + interval '3 days'
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;
  v_pay_soon := v_n;

  return jsonb_build_object('trial_ended', v_trial_ended, 'overdue', v_overdue, 'paused', v_paused,
                            'trial_reminders', v_trial_soon, 'payment_reminders', v_pay_soon);
end $$;
revoke execute on function public.run_host_lifecycle() from public, anon, authenticated;

select cron.schedule('hostello-host-lifecycle', '30 2 * * *', 'select public.run_host_lifecycle();');

-- 5. A host who deletes their account takes their data with them, but what they paid
--    stays on record: the payment keeps a name and email instead of a link.
alter table public.subscription_payments alter column client_id drop not null;
alter table public.subscription_payments drop constraint subscription_payments_client_id_fkey;
alter table public.subscription_payments
  add constraint subscription_payments_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;
alter table public.subscription_payments add column client_name text, add column client_email text;
update public.subscription_payments p set client_name = c.name, client_email = c.contact_email
  from public.clients c where c.id = p.client_id;

-- admin_record_subscription_payment now writes the name and email with each payment
-- (patched in place; see 20261018170000_host_admin_tools.sql for the rest of the function).
do $$
declare
  v_def text := pg_get_functiondef('public.admin_record_subscription_payment(uuid, numeric, text, text, integer, text)'::regprocedure);
  v_old text := 'insert into subscription_payments (client_id, amount, method, reference, months, period_end, note, recorded_by)
  values (p_client_id, p_amount, p_method, nullif(trim(p_reference), ''''), p_months, v_end, nullif(trim(p_note), ''''), auth.uid());';
  v_new text := 'insert into subscription_payments (client_id, client_name, client_email, amount, method, reference, months, period_end, note, recorded_by)
  select p_client_id, c.name, c.contact_email, p_amount, p_method, nullif(trim(p_reference), ''''), p_months, v_end, nullif(trim(p_note), ''''), auth.uid()
  from clients c where c.id = p_client_id;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_record_subscription_payment no longer has the expected insert';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- Everything hangs off the client row (properties, bookings, expenses, photos, links…
-- all cascade). Called by the app with the server key, after it has read the file paths.
create or replace function public.purge_host_account(p_client_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = p_client_id and account_type = 'host') then
    raise exception 'That is not a host account.';
  end if;
  delete from clients where id = p_client_id;
end $$;
revoke execute on function public.purge_host_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_host_account(uuid) to service_role;
