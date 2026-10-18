-- Host mode, phase 5: what the owner of the platform needs to run hosts.
-- Applied to the live DB as `host_admin_tools` on 2026-10-18.

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  method text not null check (method in ('bank', 'jazzcash', 'easypaisa', 'cash', 'other')),
  reference text,
  months integer not null check (months in (1, 12)),
  period_end timestamptz not null,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.subscription_payments is 'A payment a host made for their plan, recorded by the admin. A gateway will write here too.';

alter table public.subscription_payments enable row level security;
create policy "subscription_payments: admin full access" on public.subscription_payments
  for all using (is_admin()) with check (is_admin());
create policy "subscription_payments: host reads own" on public.subscription_payments
  for select using (exists (
    select 1 from public.clients c
    where c.id = subscription_payments.client_id and c.owner_user_id = (select auth.uid())));
revoke all on public.subscription_payments from anon;

create trigger audit_subscription_payments after insert or update or delete on public.subscription_payments
  for each row execute function public.audit_row();

-- Marking a payment received is one act: the payment, and the plan it pays for.
-- A payment made before the period ends adds to it; a lapsed host starts from today.
create or replace function public.admin_record_subscription_payment(
  p_client_id uuid, p_amount numeric, p_method text, p_reference text, p_months integer, p_note text
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_end timestamptz;
begin
  if not is_admin() then
    raise exception 'Only the owner can record a payment.';
  end if;
  if not exists (select 1 from clients where id = p_client_id and account_type = 'host') then
    raise exception 'That is not a host account.';
  end if;
  if not exists (select 1 from subscriptions where client_id = p_client_id) then
    raise exception 'That host has no plan to pay for.';
  end if;

  select greatest(coalesce(current_period_end, now()), now()) into v_from
  from subscriptions where client_id = p_client_id;
  v_end := v_from + make_interval(months => p_months);

  insert into subscription_payments (client_id, amount, method, reference, months, period_end, note, recorded_by)
  values (p_client_id, p_amount, p_method, nullif(trim(p_reference), ''), p_months, v_end, nullif(trim(p_note), ''), auth.uid());

  update subscriptions
     set status = 'active',
         billing_period = case when p_months = 12 then 'annual' else 'monthly' end,
         current_period_end = v_end
   where client_id = p_client_id;

  return v_end;
end $$;
revoke execute on function public.admin_record_subscription_payment(uuid, numeric, text, text, integer, text) from public, anon;
grant execute on function public.admin_record_subscription_payment(uuid, numeric, text, text, integer, text) to authenticated;

-- Tell the owner when someone signs up. client_id is left empty on purpose: a
-- notice about a host's own account would not reach staff (see fan_out_notification).
-- (Applied as a patch to handle_host_signup; the function in 20261018130000 plus this
-- block is the live definition.)
do $$
declare
  v_def text := pg_get_functiondef('public.handle_host_signup()'::regprocedure);
  v_old text := E'values (v_client, ''starter'', ''trial'', now() + interval ''14 days'');';
  v_new text := v_old || E'\n\n    insert into notifications (kind, category, audience, title, body, event_key)\n    values (''host_signup'', ''system'', ''admin'',\n            ''New host: '' || coalesce(v_name, new.email),\n            new.email || '' started a 14-day trial.'',\n            ''host_signup:'' || new.id::text)\n    on conflict (event_key) where event_key is not null do nothing;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'handle_host_signup no longer has the expected subscription insert';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
