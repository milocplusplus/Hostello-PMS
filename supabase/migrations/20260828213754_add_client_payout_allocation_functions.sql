-- Confirming a payment and spreading it over bookings has to be one step, or a
-- half-applied payment leaves the balance lying. Both run as one statement from
-- the server rather than a loop of round trips to Sydney.

create or replace function public.apply_client_payout(p_payout_id uuid)
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
           b.hostello_share - coalesce((
             select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id
           ), 0) as outstanding
      from bookings b
     where b.client_id = v_client
       and b.status = 'confirmed'
       and b.share_received = false
       and b.hostello_share > 0
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
$$;

-- The undo. Marking a payment received is a money decision made in one click,
-- so it has to be reversible; a booking only reopens if the remaining
-- allocations no longer cover its share.
create or replace function public.revoke_client_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
       and b.hostello_share > coalesce((
         select sum(a.amount) from client_payout_allocations a where a.booking_id = b.id
       ), 0);
  end loop;

  update client_payouts
     set status = 'pending', reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_payout_id;
end;
$$;

-- A fresh function keeps its default PUBLIC grant, which anon inherits.
revoke execute on function public.apply_client_payout(uuid) from public, anon;
revoke execute on function public.revoke_client_payout(uuid) from public, anon;
grant execute on function public.apply_client_payout(uuid) to authenticated;
grant execute on function public.revoke_client_payout(uuid) to authenticated;
