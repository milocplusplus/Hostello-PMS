-- The owner's three verbs on a payout Hostello says it sent. SECURITY DEFINER
-- because a client session has no write rights on `bookings` or
-- `hostello_payouts` -- it still has to be the side that decides the money
-- arrived. Each one checks the caller owns the client on the entry.
--
-- This file folds in `20260903012419_lock_down_hostello_payout_rpcs`: the first
-- pass only revoked EXECUTE from `anon`, which does nothing while PUBLIC still
-- holds the default grant. The revoke has to be from PUBLIC, with the two roles
-- granted back -- the ACL every other SECURITY DEFINER function here has.

create or replace function public.owns_hostello_payout(p_payout_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from hostello_payouts p
      join clients c on c.id = p.client_id
     where p.id = p_payout_id and c.owner_user_id = auth.uid()
  );
$$;

-- The money landed. Marks the entry received and spreads it over the owner's
-- open bookings oldest first, closing each `settled` as it is fully covered.
-- One transaction: a half-applied payout would leave the balance lying.
-- Returns whatever the bookings could not absorb, left as credit.
create or replace function public.apply_hostello_payout(p_payout_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client uuid;
  v_amount numeric;
  v_left numeric;
  v_take numeric;
  r record;
begin
  -- Only the side that receives the money says it arrived. Not even an admin.
  if not owns_hostello_payout(p_payout_id) then
    raise exception 'only the property owner can confirm this payout';
  end if;

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
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id;

  v_left := v_amount;

  for r in
    select b.id,
           b.client_payout - coalesce((
             select sum(a.amount) from hostello_payout_allocations a where a.booking_id = b.id
           ), 0) as outstanding
      from bookings b
     where b.client_id = v_client
       and b.status = 'confirmed'
       and b.settled = false
       and b.client_payout > 0
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

  return v_left;
end;
$$;

-- It never arrived. Nothing settles -- the entry stays on the record with the
-- owner's reason so Hostello can correct it and send again.
create or replace function public.reject_hostello_payout(p_payout_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not owns_hostello_payout(p_payout_id) then
    raise exception 'only the property owner can respond to this payout';
  end if;

  update hostello_payouts
     set status = 'rejected',
         client_note = nullif(btrim(coalesce(p_reason, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_payout_id and status <> 'received';
end;
$$;

-- Confirmed by mistake. Pulls the allocations back off the bookings they
-- closed. The owner can undo their own confirmation; an admin can undo any,
-- because a wrongly-closed booking is Hostello's problem to unpick too.
create or replace function public.revoke_hostello_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
       and b.client_payout > coalesce((
         select sum(a.amount) from hostello_payout_allocations a where a.booking_id = b.id
       ), 0);
  end loop;

  update hostello_payouts
     set status = 'pending', reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_payout_id;
end;
$$;

revoke execute on function public.owns_hostello_payout(uuid) from public;
revoke execute on function public.apply_hostello_payout(uuid) from public;
revoke execute on function public.reject_hostello_payout(uuid, text) from public;
revoke execute on function public.revoke_hostello_payout(uuid) from public;

grant execute on function public.owns_hostello_payout(uuid) to authenticated, service_role;
grant execute on function public.apply_hostello_payout(uuid) to authenticated, service_role;
grant execute on function public.reject_hostello_payout(uuid, text) to authenticated, service_role;
grant execute on function public.revoke_hostello_payout(uuid) to authenticated, service_role;
