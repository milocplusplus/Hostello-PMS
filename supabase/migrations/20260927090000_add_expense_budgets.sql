-- Expense budgets and alerts (phase 4 of docs/expenses.md) -------------------
--
-- An owner sets a monthly limit on a category -- across everything, or on one
-- unit -- and the daily job tells them the morning after it is crossed. Where a
-- category has no budget at all, the job instead tells them when a month runs
-- well above what that category usually costs. Tracking only, like the rest:
-- nothing here is read by Settlements or the payout math.

create table if not exists expense_budgets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Unlike on `expenses`, these cascade: a limit on a unit or a category that
  -- is gone has nothing left to measure, and is no record worth keeping.
  category_id uuid not null references expense_categories(id) on delete cascade,
  -- Null is the whole category: every unit and the general bills together.
  property_id uuid references properties(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One limit per category per unit, and one for the category as a whole.
create unique index if not exists expense_budgets_scope_uniq
  on expense_budgets (client_id, category_id, property_id) nulls not distinct;
create index if not exists expense_budgets_category_idx on expense_budgets (category_id);
create index if not exists expense_budgets_property_idx on expense_budgets (property_id);
create index if not exists expense_budgets_created_by_idx on expense_budgets (created_by);

alter table expense_budgets enable row level security;

create policy "expense_budgets: admin reads" on expense_budgets
  for select using (is_admin());

create policy "expense_budgets: client reads own" on expense_budgets
  for select using (exists (
    select 1 from clients c
    where c.id = expense_budgets.client_id and c.owner_user_id = (select auth.uid())
  ));

create policy "expense_budgets: client adds own" on expense_budgets
  for insert with check (
    exists (
      select 1 from clients c
      where c.id = expense_budgets.client_id and c.owner_user_id = (select auth.uid())
    )
    and (expense_budgets.property_id is null or exists (
      select 1 from properties pr
      where pr.id = expense_budgets.property_id and pr.client_id = expense_budgets.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = expense_budgets.category_id
        and (ec.client_id is null or ec.client_id = expense_budgets.client_id)
    )
  );

create policy "expense_budgets: client edits own" on expense_budgets
  for update
  using (exists (
    select 1 from clients c
    where c.id = expense_budgets.client_id and c.owner_user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from clients c
      where c.id = expense_budgets.client_id and c.owner_user_id = (select auth.uid())
    )
    and (expense_budgets.property_id is null or exists (
      select 1 from properties pr
      where pr.id = expense_budgets.property_id and pr.client_id = expense_budgets.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = expense_budgets.category_id
        and (ec.client_id is null or ec.client_id = expense_budgets.client_id)
    )
  );

create policy "expense_budgets: client deletes own" on expense_budgets
  for delete using (exists (
    select 1 from clients c
    where c.id = expense_budgets.client_id and c.owner_user_id = (select auth.uid())
  ));

-- The job ---------------------------------------------------------------------
-- Once a day, over this month and last -- a bill logged on the evening of the
-- 30th is only seen on the 1st. Confirmed expenses only, by bill date: a due
-- bill is a reminder, not a cost. `budgetSpent()` in src/lib/expenses.ts is the
-- same rule for the page; the two must agree.
--
-- event_key is per client / category / unit / month, so each crossing is told
-- once a month however often the job runs or the limit changes. Like
-- generate_due_expenses(), it inserts directly: bell and Realtime, no push.

create or replace function public.notify_expense_alerts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_month date;
  v_sent integer := 0;
  v_n integer;
begin
  foreach v_month in array array[
    date_trunc('month', v_today)::date,
    (date_trunc('month', v_today) - interval '1 month')::date
  ]
  loop
    -- A budget crossed: spent more than the limit, not merely reached it.
    insert into notifications (kind, category, audience, title, body, client_id, property_id, event_key)
    select
      'expense_budget_crossed',
      'payment',
      'client',
      'Over budget: ' || ec.name || coalesce(' (' || p.name || ')', ''),
      'Rs ' || to_char(round(s.spent), 'FM999,999,999') || ' in ' || to_char(v_month, 'FMMonth')
        || ' against a budget of Rs ' || to_char(round(b.amount), 'FM999,999,999') || '.',
      b.client_id,
      b.property_id,
      'expense_budget:' || b.client_id::text || ':' || b.category_id::text || ':'
        || coalesce(b.property_id::text, 'all') || ':' || to_char(v_month, 'YYYY-MM')
    from expense_budgets b
    join expense_categories ec on ec.id = b.category_id
    left join properties p on p.id = b.property_id
    cross join lateral (
      select coalesce(sum(e.amount), 0) as spent
      from expenses e
      where e.client_id = b.client_id
        and e.category_id = b.category_id
        and (b.property_id is null or e.property_id = b.property_id)
        and e.confirmed
        and e.incurred_on >= v_month
        and e.incurred_on < (v_month + interval '1 month')::date
    ) s
    where s.spent > b.amount
    on conflict (event_key) where event_key is not null do nothing;

    get diagnostics v_n = row_count;
    v_sent := v_sent + v_n;

    -- No budget on the category at all: a month above 1.5x the three before it.
    -- Only once the category has three months behind it -- its first expense
    -- in or before the third month back -- and an average above zero, so a
    -- first bill or a one-off repair in a new category says nothing.
    insert into notifications (kind, category, audience, title, body, client_id, event_key)
    select
      'expense_running_high',
      'payment',
      'client',
      ec.name || ' is running high',
      'Rs ' || to_char(round(t.spent), 'FM999,999,999') || ' in ' || to_char(v_month, 'FMMonth')
        || ', about ' || to_char(t.spent / t.average, 'FM990.0') || '× the Rs '
        || to_char(round(t.average), 'FM999,999,999') || ' a month it averaged over the three before.',
      t.client_id,
      'expense_high:' || t.client_id::text || ':' || t.category_id::text || ':' || to_char(v_month, 'YYYY-MM')
    from (
      select
        e.client_id,
        e.category_id,
        coalesce(sum(e.amount) filter (where e.incurred_on >= v_month), 0) as spent,
        coalesce(sum(e.amount) filter (where e.incurred_on < v_month), 0) / 3.0 as average
      from expenses e
      where e.confirmed
        and e.incurred_on >= (v_month - interval '3 months')::date
        and e.incurred_on < (v_month + interval '1 month')::date
      group by e.client_id, e.category_id
    ) t
    join expense_categories ec on ec.id = t.category_id
    where t.average > 0
      and t.spent > t.average * 1.5
      and not exists (
        select 1 from expense_budgets b
        where b.client_id = t.client_id and b.category_id = t.category_id
      )
      and (
        select min(e2.incurred_on) from expenses e2
        where e2.client_id = t.client_id and e2.category_id = t.category_id and e2.confirmed
      ) < (v_month - interval '2 months')::date
    on conflict (event_key) where event_key is not null do nothing;

    get diagnostics v_n = row_count;
    v_sent := v_sent + v_n;
  end loop;

  return v_sent;
end;
$$;

revoke execute on function public.notify_expense_alerts() from public, anon, authenticated;
grant execute on function public.notify_expense_alerts() to service_role;

-- 02:10 UTC = 07:10 Karachi, after hostello-expenses-due. Order doesn't matter
-- to the result -- due bills count in nothing -- but it keeps the morning's
-- notifications in the order they happened.
select cron.schedule('hostello-expense-alerts', '10 2 * * *', $cron$select public.notify_expense_alerts();$cron$);

comment on table public.expense_budgets is
  'An owner''s monthly limit on a category, across everything (property_id null) or on one unit. notify_expense_alerts() tells them when it is crossed.';
comment on function public.notify_expense_alerts() is
  'Run by the hostello-expense-alerts cron at 02:10 UTC (07:10 Karachi): budgets crossed, and unbudgeted categories above 1.5x their 3-month average. event_key makes a re-run a no-op.';
