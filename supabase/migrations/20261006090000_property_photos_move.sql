-- Staff (admin + ops) may move a gallery photo to another room after upload.
-- The grant is on `room` alone, so the paths and the cover flag stay out of
-- reach; owners get no UPDATE policy. Not audited: the audit trigger on this
-- table fires on insert and delete only.

grant update (room) on public.property_photos to authenticated;

create policy "property photos: staff re-file" on public.property_photos
  for update to authenticated
  using ((select is_staff()))
  with check ((select is_staff()));
