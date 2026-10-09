-- Who received the guest's money, per booking — advance and balance apart.
--
-- Settlement used to assume Hostello collected every Airbnb / Booking.com /
-- direct stay, so an Airbnb payout that landed in the owner's account still
-- showed as money Hostello owed them. It now follows the money: `payout.ts`
-- nets each stay to one figure (`due_to_client` or `due_to_hostello`) and the
-- settlement functions read those two columns and nothing else.

alter table public.bookings
  add column advance_received_by text not null default 'owner'
    check (advance_received_by in ('hostello', 'owner')),
  add column balance_received_by text not null default 'owner'
    check (balance_received_by in ('hostello', 'owner')),
  add column due_to_client numeric not null default 0,
  add column due_to_hostello numeric not null default 0;

-- Who received it is not a split figure: everyone who can read the booking
-- reads it. The two amounts are money and stay off the base table, like the
-- rest of the split. All four are written by the booking writer only.
grant select (advance_received_by, balance_received_by) on public.bookings to authenticated;

-- Existing stays: only a stay Hostello sold directly was paid to Hostello.
-- Not an edit anyone made, so it stays out of the audit log.
alter table public.bookings disable trigger user;

update public.bookings
   set advance_received_by = 'hostello',
       balance_received_by = 'hostello',
       due_to_client = client_payout
 where source = 'hostello';

update public.bookings
   set due_to_hostello = hostello_share
 where source <> 'hostello';

alter table public.bookings enable trigger user;

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
    case when not is_ops() then due_to_hostello else null::numeric end as due_to_hostello
   from bookings b
  where is_staff() or (exists ( select 1
           from clients c
          where c.id = b.client_id and c.owner_user_id = auth.uid()));

-- The settlement functions, reading the netted amounts.

create or replace function public.allocate_hostello_payout(p_payout_id uuid, p_offline boolean)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_amount numeric;
  v_left numeric;
  v_take numeric;
  r record;
begin
  select client_id, amount into v_client, v_amount
  from hostello_payouts
  where id = p_payout_id and status <> 'received'
  for update;

  -- Already confirmed, or gone: a re-submitted form, not a second payment.
  if v_client is null then
    return 0;
  end if;

  update hostello_payouts
     set status = 'received',
         client_note = null,
         confirmed_offline = p_offline,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id;

  v_left := v_amount;

  for r in
    select b.id,
           b.due_to_client - coalesce((
             select sum(a.amount) from hostello_payout_allocations a where a.booking_id = b.id
           ), 0) as outstanding
      from bookings b
     where b.client_id = v_client
       and b.status = 'confirmed'
       and b.settled = false
       and b.due_to_client > 0
     order by b.check_in, b.created_at
  loop
    exit when v_left <= 0;
    continue when r.outstanding <= 0;

    v_take := least(v_left, r.outstanding);

    insert into hostello_payout_allocations (payout_id, booking_id, client_id, amount)
    values (p_payout_id, r.id, v_client, v_take);

    v_left := v_left - v_take;

    if v_take >= r.outstanding then
      update bookings
         set settled = true, settled_date = current_date
       where id = r.id;
    end if;
  end loop;

  -- Whatever the bookings could not absorb: an overpayment, left as credit.
  return v_left;
end;
$function$;

create or replace function public.apply_client_payout(p_payout_id uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_amount numeric;
  v_left numeric;
  v_take numeric;
  r record;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  select client_id, amount into v_client, v_amount
  from client_payouts
  where id = p_payout_id and status <> 'received'
  for update;

  -- Already confirmed, or gone: a re-submitted form, not a second payment.
  if v_client is null then
    return 0;
  end if;

  update client_payouts
     set status = 'received',
         admin_note = null,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id;

  v_left := v_amount;

  for r in
    select b.id,
           b.due_to_hostello - coalesce((
             select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id
           ), 0) as outstanding
      from bookings b
     where b.client_id = v_client
       and b.status = 'confirmed'
       and b.share_received = false
       and b.due_to_hostello > 0
     order by b.check_in, b.created_at
  loop
    exit when v_left <= 0;
    continue when r.outstanding <= 0;

    v_take := least(v_left, r.outstanding);

    insert into client_payout_allocations (payout_id, booking_id, client_id, amount)
    values (p_payout_id, r.id, v_client, v_take);

    v_left := v_left - v_take;

    if v_take >= r.outstanding then
      update bookings
         set share_received = true, share_received_date = current_date
       where id = r.id;
    end if;
  end loop;

  -- Whatever the bookings could not absorb: an overpayment, left as credit.
  return v_left;
end;
$function$;

create or replace function public.owed_to_hostello(p_client_id uuid)
 returns table(balance numeric, stays integer, pending numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with open_stays as (
    select greatest(0, b.due_to_hostello - coalesce(
             (select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id), 0)) as outstanding
      from bookings b
     where b.client_id = p_client_id
       and b.status = 'confirmed'
       and not b.share_received
       and b.due_to_hostello > 0
  )
  select round(coalesce(sum(outstanding), 0), 2),
         count(*) filter (where outstanding > 0)::integer,
         coalesce((select sum(amount) from client_payouts
                    where client_id = p_client_id and status = 'pending'), 0)
    from open_stays;
$function$;

create or replace function public.revoke_client_payout(p_payout_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  for r in select distinct booking_id from client_payout_allocations where payout_id = p_payout_id
  loop
    delete from client_payout_allocations
     where payout_id = p_payout_id and booking_id = r.booking_id;

    update bookings b
       set share_received = false, share_received_date = null
     where b.id = r.booking_id
       and b.due_to_hostello > coalesce((
         select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id
       ), 0);
  end loop;

  update client_payouts
     set status = 'pending', reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_payout_id;
end;
$function$;

create or replace function public.revoke_hostello_payout(p_payout_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
begin
  if not (is_admin() or owns_hostello_payout(p_payout_id)) then
    raise exception 'not allowed';
  end if;

  for r in select distinct booking_id from hostello_payout_allocations where payout_id = p_payout_id
  loop
    delete from hostello_payout_allocations
     where payout_id = p_payout_id and booking_id = r.booking_id;

    update bookings b
       set settled = false, settled_date = null
     where b.id = r.booking_id
       and b.due_to_client > coalesce((
         select sum(a.amount) from hostello_payout_allocations a where a.booking_id = b.id
       ), 0);
  end loop;

  update hostello_payouts
     set status = 'pending',
         confirmed_offline = false,
         reviewed_by = null,
         reviewed_at = null,
         updated_at = now()
   where id = p_payout_id;
end;
$function$;

-- Its only caller was allocate_hostello_payout's source filter, which the
-- netted amount replaces.
drop function public.is_pass_through_source(text);
