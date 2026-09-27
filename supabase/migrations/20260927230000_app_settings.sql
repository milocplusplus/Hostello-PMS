-- Business settings: one row the admin edits on /admin/settings.
--
-- Read through `app_settings_v`, which hands each audience only its part:
-- the deal defaults are the admin's alone (ops never sees deal terms, and an
-- owner has no business with anyone else's), and a signed-out visitor — the
-- login page — gets the contact line and nothing more.

create table public.app_settings (
  id boolean primary key default true check (id),

  -- Pre-fill for a new client. Existing clients keep their own terms.
  default_deal_model client_deal_model not null default 'percent',
  default_monthly_fee numeric not null default 0,
  default_share_percent numeric not null default 20,
  default_deduct_percent numeric not null default 0,
  default_ota_model client_ota_model not null default 'percent',
  default_ota_share_percent numeric not null default 20,

  checkin_time time not null default '14:00',
  checkout_time time not null default '12:00',
  short_stay_start time not null default '12:00',
  short_stay_end time not null default '18:00',
  default_booking_status text not null default 'confirmed'
    check (default_booking_status in ('confirmed', 'tentative')),

  -- What ops may do. All on means ops works as it always has.
  ops_can_edit_prices boolean not null default true,
  ops_can_cancel boolean not null default true,
  ops_can_block boolean not null default true,

  business_name text not null default 'Hostello',
  business_phone text,
  business_email text,
  business_address text,

  -- [{ kind: 'bank', bank, title, number, iban } | { kind: 'jazzcash' | 'easypaisa', title, number }]
  payment_accounts jsonb not null default '[]'::jsonb,
  -- { arrival?, balance?, checkout? } — a missing key means the built-in text.
  guest_templates jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

create policy app_settings_admin_read on public.app_settings
  for select to authenticated using ((select public.is_admin()));
create policy app_settings_admin_update on public.app_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.app_settings from anon, authenticated;
grant select, update on public.app_settings to authenticated;

create view public.app_settings_v with (security_invoker = false) as
select
  case when is_admin() then default_deal_model end as default_deal_model,
  case when is_admin() then default_monthly_fee end as default_monthly_fee,
  case when is_admin() then default_share_percent end as default_share_percent,
  case when is_admin() then default_deduct_percent end as default_deduct_percent,
  case when is_admin() then default_ota_model end as default_ota_model,
  case when is_admin() then default_ota_share_percent end as default_ota_share_percent,
  case when signed_in then checkin_time end as checkin_time,
  case when signed_in then checkout_time end as checkout_time,
  case when signed_in then short_stay_start end as short_stay_start,
  case when signed_in then short_stay_end end as short_stay_end,
  case when signed_in then default_booking_status end as default_booking_status,
  case when signed_in then ops_can_edit_prices end as ops_can_edit_prices,
  case when signed_in then ops_can_cancel end as ops_can_cancel,
  case when signed_in then ops_can_block end as ops_can_block,
  business_name,
  business_phone,
  business_email,
  business_address,
  case when signed_in then payment_accounts else '[]'::jsonb end as payment_accounts,
  case when signed_in then guest_templates else '{}'::jsonb end as guest_templates
from public.app_settings
cross join lateral (select auth.uid() is not null as signed_in) s;

grant select on public.app_settings_v to anon, authenticated;

-- ── Ops rules, where every path meets ───────────────────────────────────────
-- Cancelling and blocking go through the session, so the database can refuse
-- them itself. Price edits are checked in `updateBooking`, beside the pricing
-- rules that decide what a date change may re-price on its own.

create or replace function public.ops_allowed(p_rule text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from profiles where id = audit_uid() and role = 'ops')
      or coalesce((select case p_rule
                            when 'cancel' then ops_can_cancel
                            when 'block' then ops_can_block
                            when 'prices' then ops_can_edit_prices
                          end from app_settings), true);
$$;

revoke all on function public.ops_allowed(text) from public, anon;
grant execute on function public.ops_allowed(text) to authenticated;

create or replace function public.enforce_ops_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'bookings' then
    if new.status = 'cancelled' and old.status <> 'cancelled' and not ops_allowed('cancel') then
      raise exception 'Operations accounts are not allowed to cancel bookings. Ask the admin.';
    end if;
    return new;
  end if;

  -- calendar_blocks: only a block a person made. A channel's imported dates
  -- (feed_id set) belong to the sync.
  if tg_op = 'INSERT' then
    if new.feed_id is null and not ops_allowed('block') then
      raise exception 'Operations accounts are not allowed to block dates. Ask the admin.';
    end if;
    return new;
  end if;

  if old.feed_id is null and not ops_allowed('block') then
    raise exception 'Operations accounts are not allowed to unblock dates. Ask the admin.';
  end if;
  return old;
end;
$$;

revoke all on function public.enforce_ops_rules() from public, anon, authenticated;

create trigger bookings_ops_rules
  before update of status on public.bookings
  for each row execute function public.enforce_ops_rules();

create trigger calendar_blocks_ops_rules
  before insert or delete on public.calendar_blocks
  for each row execute function public.enforce_ops_rules();

-- ── Audit ───────────────────────────────────────────────────────────────────

create trigger audit_app_settings
  after update on public.app_settings
  for each row execute function public.audit_row();

do $$
declare d text;
begin
  select pg_get_functiondef('public.audit_row()'::regprocedure) into d;
  if position('    when ''profiles'' then' in d) = 0 then raise exception 'audit_row changed shape'; end if;
  execute replace(d, '    when ''profiles'' then',
    '    when ''app_settings'' then' || E'\n' ||
    '      v_category := ''settings'';' || E'\n' ||
    '      v_label := ''Business settings'';' || E'\n' ||
    '    when ''profiles'' then');
end;
$$;
