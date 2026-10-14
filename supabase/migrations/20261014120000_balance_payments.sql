-- The guest's balance counts only once someone has recorded receiving it.
--
-- A booking used to say who *would* receive the balance (`balance_received_by`)
-- and settlement treated that as money already in hand, so a stay with only
-- its advance in showed the full price as owed. The balance is now a list of
-- payments, each saying who took it. `payout.ts` nets a stay on what has been
-- received — the advance plus the confirmed payments — and nothing else.
--
-- Admin records count at once. Ops (at the door) and the owner (a guest paid
-- them) file a `pending` payment that changes no balance until an admin
-- confirms it — the same rule as a payment to Hostello.

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- Copied from the booking by the trigger below, never taken from the caller.
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  received_by text not null check (received_by in ('hostello', 'owner')),
  method text not null check (method in ('online', 'cash')),
  paid_on date not null default current_date,
  note text,
  status text not null default 'pending' check (status in ('pending', 'received', 'rejected')),
  review_note text,
  recorded_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_payments_booking on public.booking_payments (booking_id);
create index booking_payments_pending on public.booking_payments (status) where status = 'pending';

create or replace function public.booking_payment_defaults()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  select client_id into new.client_id from bookings where id = new.booking_id;
  new.recorded_by := coalesce(audit_uid(), new.recorded_by);
  return new;
end;
$function$;

create trigger booking_payment_defaults
  before insert on public.booking_payments
  for each row execute function public.booking_payment_defaults();

alter table public.booking_payments enable row level security;

create policy booking_payments_read on public.booking_payments
  for select to authenticated
  using (
    is_staff()
    or exists (select 1 from clients c where c.id = client_id and c.owner_user_id = auth.uid())
  );

-- The admin's own record counts at once; anyone else's waits for the admin.
create policy booking_payments_file on public.booking_payments
  for insert to authenticated
  with check (
    is_admin()
    or (
      status = 'pending'
      and (
        is_ops()
        or exists (select 1 from clients c where c.id = client_id and c.owner_user_id = auth.uid())
      )
    )
  );

create policy booking_payments_review on public.booking_payments
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- The admin may take any entry back; whoever filed one may withdraw it while
-- it is still waiting.
create policy booking_payments_withdraw on public.booking_payments
  for delete to authenticated
  using (is_admin() or (status = 'pending' and recorded_by = auth.uid()));

grant select, insert, update, delete on public.booking_payments to authenticated;

create trigger audit_booking_payments
  after insert or delete or update on public.booking_payments
  for each row execute function public.audit_row();

-- A stay's amounts move after it was settled now (a balance arrives, a price
-- is edited): reopen it when what is owed outgrows what was paid, close it
-- when what was paid already covers it. One place, so every write path agrees.
create or replace function public.sync_settlement_flags()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_paid numeric;
begin
  if new.due_to_client is distinct from old.due_to_client then
    select coalesce(sum(amount), 0) into v_paid
      from hostello_payout_allocations where booking_id = new.id;
    if v_paid > 0 and v_paid >= new.due_to_client then
      if not new.settled then
        new.settled := true;
        new.settled_date := current_date;
      end if;
    elsif new.settled and v_paid < new.due_to_client then
      new.settled := false;
      new.settled_date := null;
    end if;
  end if;

  if new.due_to_hostello is distinct from old.due_to_hostello then
    select coalesce(sum(amount), 0) into v_paid
      from client_payout_allocations where booking_id = new.id;
    if v_paid > 0 and v_paid >= new.due_to_hostello then
      if not new.share_received then
        new.share_received := true;
        new.share_received_date := current_date;
      end if;
    elsif new.share_received and v_paid < new.due_to_hostello then
      new.share_received := false;
      new.share_received_date := null;
    end if;
  end if;

  return new;
end;
$function$;

create trigger bookings_sync_settlement
  before update of due_to_client, due_to_hostello on public.bookings
  for each row execute function public.sync_settlement_flags();

-- Airbnb guests pay Airbnb up front: the whole price is the advance, received
-- by whoever the stay already named (the owner unless someone changed it).
-- Not an edit anyone made, so it stays out of the audit log.
alter table public.bookings disable trigger user;

update public.bookings
   set advance_received = sale_price,
       advance_received_by = balance_received_by
 where source = 'airbnb';

alter table public.bookings enable trigger user;

drop view public.bookings_v;
alter table public.bookings drop column balance_received_by;

create view public.bookings_v with (security_invoker = false) as
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
    case when not is_ops() then due_to_client else null::numeric end as due_to_client,
    case when not is_ops() then due_to_hostello else null::numeric end as due_to_hostello,
    case when not is_ops() then hostello_share_override else null::numeric end as hostello_share_override,
    -- What the guest has paid after the advance, and what is still to come.
    -- Not split figures: ops takes this money at the door.
    pay.paid_hostello as balance_paid_hostello,
    pay.paid_owner as balance_paid_owner,
    pay.pending as balance_pending,
    greatest(0, coalesce(b.sale_price, 0) - coalesce(b.advance_received, 0)
      - pay.paid_hostello - pay.paid_owner) as balance_due
   from bookings b
   cross join lateral (
     select coalesce(sum(p.amount) filter (where p.status = 'received' and p.received_by = 'hostello'), 0) as paid_hostello,
            coalesce(sum(p.amount) filter (where p.status = 'received' and p.received_by = 'owner'), 0) as paid_owner,
            coalesce(sum(p.amount) filter (where p.status = 'pending'), 0) as pending
       from booking_payments p
      where p.booking_id = b.id
   ) pay
  where is_staff() or (exists ( select 1
           from clients c
          where c.id = b.client_id and c.owner_user_id = auth.uid()));

grant select on public.bookings_v to authenticated;
grant select on public.bookings_v to service_role;

-- The audit trigger names a payment by its amount, like the other money rows.
create or replace function public.audit_row()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ignore constant text[] := array[
    'updated_at', 'last_synced_at', 'last_error', 'last_event_count',
    'last_fetched_at', 'fetch_count', 'token', 'consecutive_failures', 'last_success_at'
  ];
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'token' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'token' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_category text;
  v_label text;
  v_client uuid;
  v_property uuid;
  v_booking uuid;
  v_cascaded boolean;
  v_actor record;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k))
    into v_changes
    from jsonb_object_keys(v_new) k
    where k <> all (v_ignore)
      and (v_old -> k) is distinct from (v_new -> k);

    if v_changes is null then
      return null;
    end if;
  end if;

  v_client := nullif(v_row ->> 'client_id', '')::uuid;
  v_property := nullif(v_row ->> 'property_id', '')::uuid;
  v_booking := nullif(v_row ->> 'booking_id', '')::uuid;

  v_cascaded := tg_op = 'DELETE' and (
    (v_client is not null and not exists (select 1 from clients where id = v_client))
    or (v_property is not null and not exists (select 1 from properties where id = v_property))
    or (v_booking is not null and not exists (select 1 from bookings where id = v_booking))
  );

  case tg_table_name
    when 'bookings' then
      v_category := 'booking';
      v_booking := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'guest_name';
    when 'booking_properties', 'calendar_blocks', 'calendar_feeds', 'calendar_exports' then
      v_category := 'booking';
    when 'client_payouts', 'hostello_payouts', 'booking_payments' then
      v_category := 'money';
      v_label := 'PKR ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');
    when 'booking_receipts' then
      v_category := 'money';
      v_label := case v_row ->> 'kind'
        when 'guest_to_hostello' then 'Receipt: guest to Hostello'
        else 'Receipt: Hostello to owner' end;
    when 'booking_guest_ids' then
      v_category := 'money';
      v_label := 'Guest ID';
    when 'clients' then
      v_category := 'client';
      v_client := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'properties' then
      v_category := 'client';
      v_property := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'property_change_requests', 'property_photos' then
      v_category := 'client';
    when 'app_settings' then
      v_category := 'settings';
      v_label := 'Business settings';
    when 'profiles' then
      v_category := 'staff';
      v_label := v_row ->> 'full_name';
    else
      v_category := 'other';
  end case;

  if v_client is null and v_property is not null then
    select client_id into v_client from properties where id = v_property;
  end if;
  if v_client is null and v_booking is not null then
    select client_id into v_client from bookings where id = v_booking;
  end if;
  if v_label is null and v_property is not null then
    select name into v_label from properties where id = v_property;
  end if;
  if tg_table_name = 'calendar_blocks' then
    v_label := concat_ws(' · ', v_label, (v_row ->> 'start_date') || ' → ' || (v_row ->> 'end_date'));
  end if;

  select * into v_actor from audit_actor(audit_uid());

  insert into audit_log (
    actor_id, actor_name, actor_role, category, action, table_name, record_id,
    label, client_id, property_id, booking_id, changes, snapshot, cascaded
  ) values (
    v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, v_category, lower(tg_op),
    tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'booking_id'),
    v_label, v_client, v_property, v_booking, v_changes,
    case when tg_op = 'UPDATE' then null else v_row end,
    v_cascaded
  );

  return null;
exception when others then
  raise warning 'audit_row(%): %', tg_table_name, sqlerrm;
  return null;
end;
$function$;

-- The two guest-payment notices an owner can receive belong with the other
-- payment notices, so the owner's "payments" switch covers them.
create or replace function public.owner_notice_group(p_kind text)
returns text
language sql
immutable
as $$
  select case
    when p_kind in ('booking_created', 'booking_updated', 'booking_cancelled',
                    'guest_checked_in', 'guest_checked_out', 'booking_checkin_tomorrow',
                    'booking_checkin_today', 'booking_checkout_today') then 'bookings'
    when p_kind in ('dates_blocked', 'dates_unblocked', 'property_added', 'property_removed',
                    'property_change_applied', 'property_change_declined') then 'calendar'
    when p_kind in ('payment_received', 'payout_confirmed', 'payout_rejected', 'share_received',
                    'payout_sent', 'client_terms_updated',
                    'balance_payment_recorded', 'balance_payment_rejected') then 'payments'
    when p_kind in ('daily_digest', 'expense_due', 'expense_budget_crossed', 'expense_running_high') then 'digest'
    when p_kind = 'payment_reminder' then 'reminder'
  end;
$$;
