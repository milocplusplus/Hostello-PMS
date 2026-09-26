-- The owner policies from add_owner_expenses called auth.uid() bare, which
-- Postgres re-evaluates per row (Supabase advisor `auth_rls_initplan`).
-- `(select auth.uid())` is evaluated once per statement. Same rules, restated.

drop policy "expense_categories: client reads defaults and own" on expense_categories;
drop policy "expense_categories: client adds own" on expense_categories;
drop policy "expense_categories: client removes own" on expense_categories;
drop policy "expenses: client reads own" on expenses;
drop policy "expenses: client adds own" on expenses;
drop policy "expenses: client edits own" on expenses;
drop policy "expenses: client deletes own" on expenses;

create policy "expense_categories: client reads defaults and own" on expense_categories
  for select using (
    client_id is null
    or exists (
      select 1 from clients c
      where c.id = expense_categories.client_id and c.owner_user_id = (select auth.uid())
    )
  );

create policy "expense_categories: client adds own" on expense_categories
  for insert with check (exists (
    select 1 from clients c
    where c.id = expense_categories.client_id and c.owner_user_id = (select auth.uid())
  ));

create policy "expense_categories: client removes own" on expense_categories
  for delete using (exists (
    select 1 from clients c
    where c.id = expense_categories.client_id and c.owner_user_id = (select auth.uid())
  ));

create policy "expenses: client reads own" on expenses
  for select using (exists (
    select 1 from clients c
    where c.id = expenses.client_id and c.owner_user_id = (select auth.uid())
  ));

create policy "expenses: client adds own" on expenses
  for insert with check (
    exists (
      select 1 from clients c
      where c.id = expenses.client_id and c.owner_user_id = (select auth.uid())
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
    where c.id = expenses.client_id and c.owner_user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from clients c
      where c.id = expenses.client_id and c.owner_user_id = (select auth.uid())
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
    where c.id = expenses.client_id and c.owner_user_id = (select auth.uid())
  ));
