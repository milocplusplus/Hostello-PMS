-- Owner expenses -------------------------------------------------------------
--
-- An owner's own books: what their units cost them. Tracking only -- nothing
-- here feeds Settlements, `owed.ts` or any booking column, and nothing ever
-- should. See docs/expenses.md.
--
-- Access: the owner reads and writes their own rows; the admin reads only;
-- ops has no policy at all, so ops sees nothing.

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  -- Null is a shared default every owner sees. Otherwise the owner's own.
  client_id uuid references clients(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create unique index if not exists expense_categories_default_name
  on expense_categories (lower(name)) where client_id is null;
create unique index if not exists expense_categories_client_name
  on expense_categories (client_id, lower(name)) where client_id is not null;

insert into expense_categories (client_id, name) values
  (null, 'Utilities'),
  (null, 'Repairs & maintenance'),
  (null, 'Fixed charges'),
  (null, 'Supplies & furnishing'),
  (null, 'Other')
on conflict do nothing;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Null is "all units / general". No cascade and no set-null: deleting a unit
  -- that has expenses should stop and say so, not quietly delete the owner's
  -- records or turn them into general ones. (A client delete still cascades
  -- both, and the check runs at the end of that statement.)
  property_id uuid references properties(id),
  -- Same reason: an owner's category cannot vanish from under its expenses.
  category_id uuid not null references expense_categories(id),
  amount numeric not null check (amount > 0),
  incurred_on date not null,
  vendor text,
  method text check (method in ('cash', 'bank', 'jazzcash', 'easypaisa', 'card')),
  paid boolean not null default true,
  due_on date,
  note text,
  receipt_path text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_client_date_idx on expenses (client_id, incurred_on desc);
create index if not exists expenses_property_idx on expenses (property_id);
create index if not exists expenses_category_idx on expenses (category_id);
create index if not exists expense_categories_client_idx on expense_categories (client_id);
create index if not exists expenses_created_by_idx on expenses (created_by);

alter table expense_categories enable row level security;
alter table expenses enable row level security;

-- Categories ----------------------------------------------------------------

create policy "expense_categories: admin reads" on expense_categories
  for select using (is_admin());

create policy "expense_categories: client reads defaults and own" on expense_categories
  for select using (
    client_id is null
    or exists (
      select 1 from clients c
      where c.id = expense_categories.client_id and c.owner_user_id = auth.uid()
    )
  );

create policy "expense_categories: client adds own" on expense_categories
  for insert with check (exists (
    select 1 from clients c
    where c.id = expense_categories.client_id and c.owner_user_id = auth.uid()
  ));

-- The expenses FK is what refuses removing one that is still in use.
create policy "expense_categories: client removes own" on expense_categories
  for delete using (exists (
    select 1 from clients c
    where c.id = expense_categories.client_id and c.owner_user_id = auth.uid()
  ));

-- Expenses ------------------------------------------------------------------

create policy "expenses: admin reads" on expenses
  for select using (is_admin());

create policy "expenses: client reads own" on expenses
  for select using (exists (
    select 1 from clients c
    where c.id = expenses.client_id and c.owner_user_id = auth.uid()
  ));

-- Theirs, on one of their units (or none), under a category they can see.
create policy "expenses: client adds own" on expenses
  for insert with check (
    exists (
      select 1 from clients c
      where c.id = expenses.client_id and c.owner_user_id = auth.uid()
    )
    and (expenses.property_id is null or exists (
      select 1 from properties pr
      where pr.id = expenses.property_id and pr.client_id = expenses.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = expenses.category_id
        and (ec.client_id is null or ec.client_id = expenses.client_id)
    )
  );

create policy "expenses: client edits own" on expenses
  for update
  using (exists (
    select 1 from clients c
    where c.id = expenses.client_id and c.owner_user_id = auth.uid()
  ))
  with check (
    exists (
      select 1 from clients c
      where c.id = expenses.client_id and c.owner_user_id = auth.uid()
    )
    and (expenses.property_id is null or exists (
      select 1 from properties pr
      where pr.id = expenses.property_id and pr.client_id = expenses.client_id
    ))
    and exists (
      select 1 from expense_categories ec
      where ec.id = expenses.category_id
        and (ec.client_id is null or ec.client_id = expenses.client_id)
    )
  );

create policy "expenses: client deletes own" on expenses
  for delete using (exists (
    select 1 from clients c
    where c.id = expenses.client_id and c.owner_user_id = auth.uid()
  ));

-- Bill photos ---------------------------------------------------------------
-- `<client_id>/<uuid>.<ext>`, same shape as `payout-receipts`. The owner
-- writes and deletes in their own folder; the admin only reads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts', 'expense-receipts', false, 8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- `objects.name`, never bare `name`: `clients` has a name column and an
-- unqualified reference silently binds to that one.
create policy "expense receipts: admin reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts' and is_admin());

create policy "expense receipts: client reads own" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));

create policy "expense receipts: client uploads own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));

create policy "expense receipts: client removes own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-receipts' and exists (
    select 1 from clients c
    where c.owner_user_id = auth.uid()
      and c.id::text = (storage.foldername(objects.name))[1]
  ));

comment on table public.expenses is
  'An owner''s own record of what their units cost. Tracking only: never read by settlements or payout math.';
comment on column public.expenses.property_id is
  'The unit this cost belongs to, or null for a general cost across all units.';
comment on column public.expenses.incurred_on is
  'Bill date. An expense counts in this month whether or not it is paid yet.';
comment on column public.expenses.paid is
  'False while the bill is still owed to the vendor; due_on is when.';
comment on table public.expense_categories is
  'Expense categories: shared defaults (client_id null) plus each owner''s own.';
