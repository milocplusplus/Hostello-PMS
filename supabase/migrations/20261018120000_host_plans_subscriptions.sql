-- Host mode, phase 1: account type, plans, subscriptions, unit limit.
-- Applied to the live DB as `host_plans_subscriptions` on 2026-10-18.
alter table public.clients
  add column account_type text not null default 'managed'
  check (account_type in ('managed', 'host'));

create table public.plans (
  key text primary key,
  name text not null,
  max_listings integer not null check (max_listings > 0),
  price_monthly numeric check (price_monthly >= 0),
  price_annual numeric check (price_annual >= 0),
  sort integer not null default 0,
  active boolean not null default true
);
comment on table public.plans is 'Host plans by listing count. Prices stay null until the owner sets them.';

insert into public.plans (key, name, max_listings, sort) values
  ('starter', 'Starter', 3, 1),
  ('growth', 'Growth', 10, 2),
  ('pro', 'Pro', 30, 3);

create table public.subscriptions (
  client_id uuid primary key references public.clients(id) on delete cascade,
  plan_key text not null references public.plans(key),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  status text not null default 'trial' check (status in ('trial', 'active', 'read_only', 'paused')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  comped boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.subscriptions is 'A host account''s plan and standing. Managed clients have none. Written by the admin or the lifecycle job, never by the host.';

create or replace function public.subscriptions_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.subscriptions_touch();

create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row();

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

create policy "plans: anyone reads" on public.plans for select using (true);
create policy "plans: admin writes" on public.plans for all using (is_admin()) with check (is_admin());

create policy "subscriptions: admin full access" on public.subscriptions
  for all using (is_admin()) with check (is_admin());
create policy "subscriptions: host reads own" on public.subscriptions
  for select using (exists (
    select 1 from public.clients c
    where c.id = subscriptions.client_id and c.owner_user_id = (select auth.uid())));

revoke all on public.subscriptions from anon;

-- A host's active units may not exceed the plan, and a lapsed host adds none.
create or replace function public.enforce_host_unit_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_max integer;
  v_status text;
  v_count integer;
begin
  if new.status::text <> 'active' then return new; end if;
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
revoke execute on function public.enforce_host_unit_limit() from public, anon, authenticated;

create trigger properties_host_limit before insert or update of status, client_id on public.properties
  for each row execute function public.enforce_host_unit_limit();
