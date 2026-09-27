-- Deactivating a client instead of deleting them.
--
-- A deactivated client keeps every booking, payment and figure; their stays
-- stay on the calendar, their balances on Money, their revenue in Stats. What
-- stops: their owner login (banned, signed out), new bookings and blocks for
-- them, their channel import and export, every notification to them, and their
-- recurring bills. Reactivating undoes all of it. The rules live here, next to
-- the data, so no screen or job can miss one.

alter table public.clients
  add column deactivated_at timestamptz,
  add column deactivated_note text;

-- Views: appended columns only, so every existing select keeps working.
create or replace view public.clients_v with (security_invoker = false) as
 select id,
    name,
    contact_email,
    contact_phone,
    owner_user_id,
    created_at,
        case when not is_ops() then deal_model else null::client_deal_model end as deal_model,
        case when not is_ops() then monthly_fee else null::numeric end as monthly_fee,
        case when not is_ops() then share_percent else null::numeric end as share_percent,
        case when not is_ops() then deduct_percent else null::numeric end as deduct_percent,
        case when not is_ops() then ota_model else null::client_ota_model end as ota_model,
        case when not is_ops() then ota_share_percent else null::numeric end as ota_share_percent,
    deactivated_at,
    deactivated_note
   from clients c
  where is_staff() or owner_user_id = auth.uid();

-- `bookable`: active unit of an active client. What every "pick a unit for a
-- new stay" list filters on — the calendar still shows the rest.
create or replace view public.properties_v with (security_invoker = false) as
 select id,
    client_id,
    name,
    location,
    city,
    type,
    status,
    created_at,
    province,
        case when not is_ops() then stack_rate else null::numeric end as stack_rate,
        case when not is_ops() then short_stay_stack_rate else null::numeric end as short_stay_stack_rate,
    max_guests,
    nightly_rate,
    short_stay_rate,
    photo_path,
    status = 'active' and not exists (
      select 1 from clients d where d.id = p.client_id and d.deactivated_at is not null
    ) as bookable
   from properties p
  where is_staff() or exists (
    select 1 from clients c where c.id = p.client_id and c.owner_user_id = auth.uid()
  );

-- ── The switch ──────────────────────────────────────────────────────────────

create or replace function public.set_client_active(p_client_id uuid, p_active boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid;
begin
  if not is_admin() then
    raise exception 'Only the owner can deactivate or reactivate a client';
  end if;

  update clients
     set deactivated_at = case when p_active then null else coalesce(deactivated_at, now()) end,
         deactivated_note = case when p_active then null else nullif(trim(p_note), '') end
   where id = p_client_id
  returning owner_user_id into v_owner;

  if not found then
    raise exception 'Client not found';
  end if;

  -- Same mechanism as an ops login's "Remove access": banned, not deleted, so
  -- the login is still on every booking it entered and comes back as it was.
  if v_owner is not null then
    update auth.users
       set banned_until = case when p_active then null else now() + interval '100 years' end,
           updated_at = now()
     where id = v_owner;

    if not p_active then
      delete from auth.sessions where user_id = v_owner;
    end if;
  end if;
end;
$$;

revoke all on function public.set_client_active(uuid, boolean, text) from public, anon;
grant execute on function public.set_client_active(uuid, boolean, text) to authenticated;

-- ── No new stays or blocks ──────────────────────────────────────────────────
-- Existing ones may still be edited; only a new row is refused.

create or replace function public.refuse_deactivated_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
begin
  if tg_table_name = 'bookings' then
    v_client := new.client_id;
  else
    select client_id into v_client from properties where id = new.property_id;
  end if;

  if exists (select 1 from clients where id = v_client and deactivated_at is not null) then
    raise exception 'This client is deactivated. Reactivate them to add bookings or blocks.';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_deactivated_client() from public, anon, authenticated;

create trigger bookings_refuse_deactivated
  before insert on public.bookings
  for each row execute function public.refuse_deactivated_client();

create trigger calendar_blocks_refuse_deactivated
  before insert on public.calendar_blocks
  for each row execute function public.refuse_deactivated_client();

-- ── No messages ─────────────────────────────────────────────────────────────
-- Every notification, app or cron, reaches a person through this fan-out, and
-- push only goes to recipient rows — so skipping them here silences all of it.

create or replace function public.fan_out_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 'staff' is 'admin' plus ops. Kept as one branch so a row is never delivered
  -- twice to an admin who matches both.
  if new.audience in ('admin', 'staff', 'both') then
    insert into notification_recipients (notification_id, user_id)
    select new.id, p.id
    from profiles p
    where (p.role = 'admin' or (new.audience = 'staff' and p.role = 'ops'))
      and p.id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  if new.audience in ('client', 'both') and new.client_id is not null then
    insert into notification_recipients (notification_id, user_id)
    select new.id, c.owner_user_id
    from clients c
    where c.id = new.client_id
      and c.owner_user_id is not null
      and c.deactivated_at is null
      and c.owner_user_id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ── No bills, no channels ───────────────────────────────────────────────────
-- Patched in place rather than restated: each gets one condition.

do $$
declare
  d text;
begin
  -- Recurring bills: skip a deactivated client's templates. Nothing is
  -- back-filled on reactivation, because only the current month is generated.
  select pg_get_functiondef('public.generate_due_expenses()'::regprocedure) into d;
  if position('    where t.active' in d) = 0 then raise exception 'generate_due_expenses changed shape'; end if;
  execute replace(d, '    where t.active',
    '    where t.active' || E'\n' ||
    '      and not exists (select 1 from clients dc where dc.id = t.client_id and dc.deactivated_at is not null)');

  -- Channel import: the sync still fetches, but writes nothing.
  select pg_get_functiondef('public.sync_calendar_feed_apply(uuid, jsonb)'::regprocedure) into d;
  if position('   where p.id = v_feed.property_id;' in d) = 0 then raise exception 'sync_calendar_feed_apply changed shape'; end if;
  execute replace(d, '   where p.id = v_feed.property_id;',
    '   where p.id = v_feed.property_id;' || E'\n\n' ||
    '  if exists (select 1 from public.clients dc where dc.id = v_client_id and dc.deactivated_at is not null) then' || E'\n' ||
    '    return jsonb_build_object(''added'', 0, ''updated'', 0, ''removed'', 0, ''clashes'', 0, ''paused'', true);' || E'\n' ||
    '  end if;');

  -- Channel export: the link answers as if switched off.
  select pg_get_functiondef('public.ical_export_document(text)'::regprocedure) into d;
  if position('  select name into v_name from public.properties where id = v_export.property_id;' in d) = 0 then
    raise exception 'ical_export_document changed shape';
  end if;
  execute replace(d, '  select name into v_name from public.properties where id = v_export.property_id;',
    '  select p.name into v_name from public.properties p join public.clients dc on dc.id = p.client_id' || E'\n' ||
    '   where p.id = v_export.property_id and dc.deactivated_at is null;');
end;
$$;

-- ── Paying a deactivated owner ──────────────────────────────────────────────
-- They cannot sign in to confirm a payout, so the admin may record it as
-- confirmed offline — the same door a client with no login already uses.

create or replace function public.admin_confirm_hostello_payout(p_payout_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  if not exists (
    select 1
      from hostello_payouts p
      join clients c on c.id = p.client_id
     where p.id = p_payout_id
       and (c.owner_user_id is null or c.deactivated_at is not null)
  ) then
    raise exception 'this client has a portal login — only they can confirm this payout';
  end if;

  return allocate_hostello_payout(p_payout_id, true);
end;
$$;
