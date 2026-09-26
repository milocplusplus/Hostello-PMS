-- Recurring expenses (phase 2 of docs/expenses.md) ---------------------------
--
-- An owner sets a bill up once -- "Internet, Unit 2, about Rs 4,000, on the
-- 5th" -- and a daily job writes it as a *due* expense when the day comes. A
-- due expense is a reminder, not a cost: it counts in no total until the owner
-- confirms the real amount, because the bills that repeat (electricity, gas)
-- are exactly the ones whose amount changes.

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Plain FKs for the same reason as on `expenses`: removing a unit or a
  -- category that a bill is set up against should stop and say so.
  property_id uuid references properties(id),
  category_id uuid not null references expense_categories(id),
  -- What it usually comes to. The due expense starts at this and the owner
  -- corrects it.
  amount numeric not null check (amount > 0),
  vendor text,
  method text check (method in ('cash', 'bank', 'jazzcash', 'easypaisa', 'card')),
  note text,
  -- 29-31 fall back to the month's last day in a shorter month.
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  -- First day of the last month a due expense was written for. This is what
  -- makes a re-run a no-op, and what stops a skipped (deleted) due expense
  -- being written again the next morning.
  last_generated_month date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_client_idx on recurring_expenses (client_id);
create index if not exists recurring_expenses_property_idx on recurring_expenses (property_id);
create index if not exists recurring_expenses_category_idx on recurring_expenses (category_id);
create index if not exists recurring_expenses_created_by_idx on recurring_expenses (created_by);

-- `confirmed = false` is a due expense: written by the job, waiting on the
-- owner. Everything an owner enters themselves is confirmed.
alter table expenses add column if not exists recurring_id uuid
  references recurring_expenses(id) on delete set null;
alter table expenses add column if not exists confirmed boolean not null default true;

create index if not exists expenses_recurring_idx on expenses (recurring_id);
create index if not exists expenses_due_idx on expenses (client_id) where not confirmed;

alter table recurring_expenses enable row level security;

create policy "recurring_expenses: admin reads" on recurring_expenses
  for select using (is_admin());

create policy "recurring_expenses: client reads own" on recurring_expenses
  for select using (exists (
    select 1 from clients c
    where c.id = recurring_expenses.client_id and c.owner_user_id = (select auth.uid())
  ));

create policy "recurring_expenses: client adds own" on recurring_expenses
  for insert with check (
    exists (
      select 1 from clients c
      where c.id = recurring_expenses.client_id and c.owner_user_id = (select auth.uid())
    )
    and (recurring_expenses.property_id is null or exists (
      select 1 from properties pr
      where pr.id = recurring_expenses.property_id and pr.client_id = recurring_expenses.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = recurring_expenses.category_id
        and (ec.client_id is null or ec.client_id = recurring_expenses.client_id)
    )
  );

create policy "recurring_expenses: client edits own" on recurring_expenses
  for update
  using (exists (
    select 1 from clients c
    where c.id = recurring_expenses.client_id and c.owner_user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from clients c
      where c.id = recurring_expenses.client_id and c.owner_user_id = (select auth.uid())
    )
    and (recurring_expenses.property_id is null or exists (
      select 1 from properties pr
      where pr.id = recurring_expenses.property_id and pr.client_id = recurring_expenses.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = recurring_expenses.category_id
        and (ec.client_id is null or ec.client_id = recurring_expenses.client_id)
    )
  );

create policy "recurring_expenses: client deletes own" on recurring_expenses
  for delete using (exists (
    select 1 from clients c
    where c.id = recurring_expenses.client_id and c.owner_user_id = (select auth.uid())
  ));

-- The job ---------------------------------------------------------------------
-- Once a day. Writes this month's due expense for every active bill whose day
-- has come and that has not been written this month, then one notification per
-- owner naming them. A cron cannot call emit_notification (no auth.uid()), so
-- it inserts directly, as notify_daily_stays() does -- which also means no
-- push, only the bell and Realtime.

create or replace function public.generate_due_expenses()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_last_day integer := extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::integer;
  v_written integer := 0;
  r record;
begin
  for r in
    select t.*
    from recurring_expenses t
    where t.active
      and (t.last_generated_month is null or t.last_generated_month < v_month)
      and extract(day from v_today) >= least(t.day_of_month, v_last_day)
    for update
  loop
    insert into expenses (
      client_id, property_id, category_id, amount, incurred_on,
      vendor, method, paid, note, recurring_id, confirmed
    )
    values (
      r.client_id, r.property_id, r.category_id, r.amount,
      v_month + least(r.day_of_month, v_last_day) - 1,
      r.vendor, r.method, false, r.note, r.id, false
    );

    update recurring_expenses set last_generated_month = v_month where id = r.id;
    v_written := v_written + 1;
  end loop;

  -- One row per owner, not per bill. `created_at = now()` is this run: now()
  -- is the transaction's start, and it is what the inserts above defaulted to.
  insert into notifications (kind, category, audience, title, body, client_id, event_key)
  select
    'expense_due',
    'payment',
    'client',
    case when count(*) = 1 then 'A bill is due: ' || min(d.label)
         else count(*) || ' bills are due' end,
    string_agg(d.label || ' · about Rs ' || to_char(round(d.amount), 'FM999,999,999'), ' · '
               order by d.label)
      || ' — confirm what each came to.',
    d.client_id,
    'expense_due:' || d.client_id::text || ':' || v_today::text
  from (
    select e.client_id, e.amount,
           ec.name || coalesce(' (' || p.name || ')', '') as label
    from expenses e
    join expense_categories ec on ec.id = e.category_id
    left join properties p on p.id = e.property_id
    where e.recurring_id is not null
      and not e.confirmed
      and e.created_at = now()
  ) d
  group by d.client_id
  on conflict (event_key) where event_key is not null do nothing;

  return v_written;
end;
$$;

revoke execute on function public.generate_due_expenses() from public, anon, authenticated;
grant execute on function public.generate_due_expenses() to service_role;

-- 02:05 UTC = 07:05 Karachi, just after hostello-daily-stays.
select cron.schedule('hostello-expenses-due', '5 2 * * *', $cron$select public.generate_due_expenses();$cron$);

comment on table public.recurring_expenses is
  'An owner''s repeating bill. generate_due_expenses() writes it once a month as an unconfirmed expense.';
comment on column public.expenses.confirmed is
  'False for a due expense the daily job wrote from a recurring bill: in no total until the owner confirms the amount.';
comment on function public.generate_due_expenses() is
  'Run by the hostello-expenses-due cron at 02:05 UTC (07:05 Karachi). last_generated_month and event_key make a re-run a no-op.';
