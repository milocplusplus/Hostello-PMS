-- Admin override for owners with no portal login -----------------------------
--
-- An owner with no portal login cannot confirm a payout, so without this their
-- bookings could never settle. The override is deliberately narrow: it works
-- only while `clients.owner_user_id is null`. The moment that client gets a
-- login, they are the only side that can say the money arrived again.
--
-- The record has to stay honest about who said so, hence `confirmed_offline`:
-- "Hostello recorded this as received" is not the same claim as "the owner
-- confirmed it", and the history must not blur them.
--
-- This file folds in three follow-ups applied separately against the live DB:
-- `lock_down_hostello_payout_override_grants`,
-- `allocate_hostello_payout_skips_pass_through` and
-- `lock_down_is_pass_through_source`.

alter table public.hostello_payouts
  add column if not exists confirmed_offline boolean not null default false;

-- A second copy of `PASS_THROUGH_SOURCES` (src/lib/payout.ts), in SQL, for the
-- same reason `ical_export_document` copies `listUnavailable`: a database
-- function cannot import the app's TypeScript. Change one, change the other.
create or replace function public.is_pass_through_source(p_source text)
returns boolean
language sql
immutable
as $$
  select p_source in ('client', 'offline', 'reference', 'other');
$$;

-- The allocation itself, with no authorization of its own. Both doors below
-- call it, so there is one copy of the loop and one definition of "covered".
-- Not granted to anyone: it is only ever reached from a SECURITY DEFINER
-- caller, which runs as the owner of this function.
create or replace function public.allocate_hostello_payout(
  p_payout_id uuid,
  p_offline boolean
)
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

  -- The pass-through filter mirrors `loadOwed("to_client")`. Without it a
  -- payout could spill onto a booking Hostello never owed and settle it. The
  -- other direction needs no such filter: `hostello_share` is already 0 on a
  -- pass-through booking, so `hostello_share > 0` excludes them by itself.
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
       and not is_pass_through_source(b.source::text)
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
$$;

/** The owner says the money arrived. The ordinary door. */
create or replace function public.apply_hostello_payout(p_payout_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only the side that receives the money says it arrived. Not even an admin,
  -- unless that client has no login at all -- see below.
  if not owns_hostello_payout(p_payout_id) then
    raise exception 'only the property owner can confirm this payout';
  end if;

  return allocate_hostello_payout(p_payout_id, false);
end;
$$;

/**
 * Hostello records the payout as received for a client who has no portal login
 * and therefore no way to confirm it themselves. Refuses the moment that client
 * has a login, so this can never become a general way around the owner.
 */
create or replace function public.admin_confirm_hostello_payout(p_payout_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  if not exists (
    select 1
      from hostello_payouts p
      join clients c on c.id = p.client_id
     where p.id = p_payout_id and c.owner_user_id is null
  ) then
    raise exception 'this client has a portal login — only they can confirm this payout';
  end if;

  return allocate_hostello_payout(p_payout_id, true);
end;
$$;

/** Undoing a confirmation also drops the claim about who made it. */
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
     set status = 'pending',
         confirmed_offline = false,
         reviewed_by = null,
         reviewed_at = null,
         updated_at = now()
   where id = p_payout_id;
end;
$$;

-- A newly created function carries BOTH a PUBLIC grant and an explicit `anon`
-- grant from this project's default privileges. Revoking from one leaves the
-- other, so both have to be named -- `apply_`/`revoke_` above look clean only
-- because CREATE OR REPLACE kept the ACL they were already given.
revoke execute on function public.is_pass_through_source(text) from public, anon, authenticated;
revoke execute on function public.allocate_hostello_payout(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_confirm_hostello_payout(uuid) from public, anon;

grant execute on function public.admin_confirm_hostello_payout(uuid) to authenticated, service_role;
