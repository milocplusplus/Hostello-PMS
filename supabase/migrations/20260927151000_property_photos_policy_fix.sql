-- The owner policies in 20260927150000 wrote `storage.foldername(name)` inside a
-- subquery on `clients`, where `name` resolves to clients.name — the client's
-- name, not the file path — so every owner upload was refused. Qualified as
-- `objects.name`, as the expense-receipts policies already are.

drop policy if exists "property photos: owner writes own" on storage.objects;
drop policy if exists "property photos: owner removes own" on storage.objects;

create policy "property photos: owner writes own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'property-photos'
    and exists (
      select 1 from clients c
      where c.owner_user_id = auth.uid()
        and c.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "property photos: owner removes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'property-photos'
    and exists (
      select 1 from clients c
      where c.owner_user_id = auth.uid()
        and c.id::text = (storage.foldername(objects.name))[1]
    )
  );
