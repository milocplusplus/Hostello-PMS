-- Storage only deletes an object the caller can also SELECT; without these,
-- replacing or removing a photo left the old file behind. (The public bucket
-- serves the image URL either way — these rows only matter to the API.)

create policy "property photos: admin reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'property-photos' and is_admin());

create policy "property photos: owner reads own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'property-photos'
    and exists (
      select 1 from clients c
      where c.owner_user_id = auth.uid()
        and c.id::text = (storage.foldername(objects.name))[1]
    )
  );
