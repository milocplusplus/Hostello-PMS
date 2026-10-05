-- Property photo gallery: up to 20 photos a unit, grouped by room.
--
-- Each photo is two files in the PRIVATE `property-gallery` bucket at
-- `<client_id>/<property_id>/<uuid>.jpg` (full size) and `…-s.jpg` (screen
-- copy). Staff (admin + ops) and the unit's owner may read, add and remove.
-- The cover is one of these photos, starred: `set_property_cover()` records
-- which, and points `properties.photo_path` at a copy of its screen file in
-- the existing public `property-photos` bucket, so cards and calendars keep
-- loading a cover without signing anything.

create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  room text not null check (room in (
    'bedroom', 'lounge', 'kitchen', 'dining', 'bathroom', 'balcony',
    'view', 'pool_garden', 'building', 'parking', 'other'
  )),
  full_path text not null unique,
  thumb_path text not null unique,
  is_cover boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index property_photos_property_idx on public.property_photos (property_id, created_at);
create index property_photos_client_idx on public.property_photos (client_id);
create unique index property_photos_one_cover on public.property_photos (property_id) where is_cover;

-- The row's client, uploader and cover flag are never the caller's to say, the
-- files must sit in the unit's own folder, and a unit stops at 20.
create function public.property_photos_prepare()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client uuid;
  v_prefix text;
begin
  -- Locking the unit makes two people uploading at once count one at a time.
  select client_id into v_client from properties where id = new.property_id for update;
  if v_client is null then
    raise exception 'Property not found';
  end if;

  new.client_id := v_client;
  new.uploaded_by := auth.uid();
  new.is_cover := false;

  v_prefix := v_client::text || '/' || new.property_id::text || '/';
  if left(new.full_path, length(v_prefix)) <> v_prefix
     or left(new.thumb_path, length(v_prefix)) <> v_prefix then
    raise exception 'Photo path must be in the unit''s own folder';
  end if;

  if (select count(*) from property_photos where property_id = new.property_id) >= 20 then
    raise exception 'A unit holds at most 20 photos. Remove one first.';
  end if;

  return new;
end;
$$;

create trigger property_photos_prepare
  before insert on public.property_photos
  for each row execute function public.property_photos_prepare();

-- Removing the starred photo leaves the unit with no cover.
create function public.property_photos_cover_gone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.is_cover then
    update properties set photo_path = null where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger property_photos_cover_gone
  after delete on public.property_photos
  for each row execute function public.property_photos_cover_gone();

-- Trigger functions: nobody calls them, and a trigger fires without the grant.
revoke execute on function public.property_photos_prepare() from public, anon, authenticated;
revoke execute on function public.property_photos_cover_gone() from public, anon, authenticated;

alter table public.property_photos enable row level security;

revoke all on public.property_photos from anon, authenticated;
grant select, insert, delete on public.property_photos to authenticated;

create policy "property photos: staff and owner read" on public.property_photos
  for select to authenticated
  using (
    (select is_staff())
    or exists (
      select 1 from clients c
      where c.id = property_photos.client_id and c.owner_user_id = (select auth.uid())
    )
  );

create policy "property photos: staff and owner add" on public.property_photos
  for insert to authenticated
  with check (
    (select is_staff())
    or exists (
      select 1 from clients c
      where c.id = property_photos.client_id and c.owner_user_id = (select auth.uid())
    )
  );

create policy "property photos: staff and owner remove" on public.property_photos
  for delete to authenticated
  using (
    (select is_staff())
    or exists (
      select 1 from clients c
      where c.id = property_photos.client_id and c.owner_user_id = (select auth.uid())
    )
  );

-- Star one photo as the unit's cover. `p_path` is the copy the app has just
-- put in the public bucket; the replaced path comes back so it can be removed.
create function public.set_property_cover(p_photo_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_property uuid;
  v_client uuid;
  v_old text;
begin
  select property_id, client_id into v_property, v_client
  from property_photos where id = p_photo_id;

  if v_property is null then
    raise exception 'Photo not found';
  end if;

  if not (
    is_staff()
    or exists (select 1 from clients c where c.id = v_client and c.owner_user_id = auth.uid())
  ) then
    raise exception 'Not allowed to change this unit''s cover';
  end if;

  if p_path is null or split_part(p_path, '/', 1) <> v_client::text then
    raise exception 'Cover path must be in the unit''s own folder';
  end if;

  select photo_path into v_old from properties where id = v_property;

  update property_photos set is_cover = false
  where property_id = v_property and is_cover and id <> p_photo_id;
  update property_photos set is_cover = true where id = p_photo_id;
  update properties set photo_path = p_path where id = v_property;

  return v_old;
end;
$$;

revoke execute on function public.set_property_cover(uuid, text) from public, anon;
grant execute on function public.set_property_cover(uuid, text) to authenticated, service_role;

-- The cover is only ever a starred gallery photo now.
drop function public.set_property_photo(uuid, text);

-- ── Storage ────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-gallery', 'property-gallery', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "property gallery: staff and owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'property-gallery'
    and (
      is_staff()
      or exists (
        select 1 from clients c
        where c.owner_user_id = auth.uid()
          and c.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

create policy "property gallery: staff and owner add" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-gallery'
    and (
      is_staff()
      or exists (
        select 1 from clients c
        where c.owner_user_id = auth.uid()
          and c.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

create policy "property gallery: staff and owner remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'property-gallery'
    and (
      is_staff()
      or exists (
        select 1 from clients c
        where c.owner_user_id = auth.uid()
          and c.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

-- Ops stars covers too, so the public cover bucket's admin rules become staff rules.
drop policy "property photos: admin reads" on storage.objects;
drop policy "property photos: admin writes" on storage.objects;
drop policy "property photos: admin removes" on storage.objects;

create policy "property photos: staff reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos' and is_staff());

create policy "property photos: staff writes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos' and is_staff());

create policy "property photos: staff removes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and is_staff());

-- ── Audit ──────────────────────────────────────────────────────────────────
-- Adds and removals only: starring is already logged as the unit's photo_path
-- changing. `audit_row()` is restated whole for its one new `case` arm.

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ignore constant text[] := array[
    'updated_at', 'last_synced_at', 'last_error', 'last_event_count',
    'last_fetched_at', 'fetch_count', 'token', 'consecutive_failures', 'last_success_at'
  ];
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'token' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'token' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb;
  v_category text;
  v_label text;
  v_client uuid;
  v_property uuid;
  v_booking uuid;
  v_cascaded boolean;
  v_actor record;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k))
    into v_changes
    from jsonb_object_keys(v_new) k
    where k <> all (v_ignore)
      and (v_old -> k) is distinct from (v_new -> k);

    if v_changes is null then
      return null;
    end if;
  end if;

  v_client := nullif(v_row ->> 'client_id', '')::uuid;
  v_property := nullif(v_row ->> 'property_id', '')::uuid;
  v_booking := nullif(v_row ->> 'booking_id', '')::uuid;

  v_cascaded := tg_op = 'DELETE' and (
    (v_client is not null and not exists (select 1 from clients where id = v_client))
    or (v_property is not null and not exists (select 1 from properties where id = v_property))
    or (v_booking is not null and not exists (select 1 from bookings where id = v_booking))
  );

  case tg_table_name
    when 'bookings' then
      v_category := 'booking';
      v_booking := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'guest_name';
    when 'booking_properties', 'calendar_blocks', 'calendar_feeds', 'calendar_exports' then
      v_category := 'booking';
    when 'client_payouts', 'hostello_payouts' then
      v_category := 'money';
      v_label := 'PKR ' || to_char((v_row ->> 'amount')::numeric, 'FM999,999,999,990');
    when 'booking_receipts' then
      v_category := 'money';
      v_label := case v_row ->> 'kind'
        when 'guest_to_hostello' then 'Receipt: guest to Hostello'
        else 'Receipt: Hostello to owner' end;
    when 'booking_guest_ids' then
      v_category := 'money';
      v_label := 'Guest ID';
    when 'clients' then
      v_category := 'client';
      v_client := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'properties' then
      v_category := 'client';
      v_property := (v_row ->> 'id')::uuid;
      v_label := v_row ->> 'name';
    when 'property_change_requests', 'property_photos' then
      v_category := 'client';
    when 'app_settings' then
      v_category := 'settings';
      v_label := 'Business settings';
    when 'profiles' then
      v_category := 'staff';
      v_label := v_row ->> 'full_name';
    else
      v_category := 'other';
  end case;

  if v_client is null and v_property is not null then
    select client_id into v_client from properties where id = v_property;
  end if;
  if v_client is null and v_booking is not null then
    select client_id into v_client from bookings where id = v_booking;
  end if;
  if v_label is null and v_property is not null then
    select name into v_label from properties where id = v_property;
  end if;
  if tg_table_name = 'calendar_blocks' then
    v_label := concat_ws(' · ', v_label, (v_row ->> 'start_date') || ' → ' || (v_row ->> 'end_date'));
  end if;

  select * into v_actor from audit_actor(audit_uid());

  insert into audit_log (
    actor_id, actor_name, actor_role, category, action, table_name, record_id,
    label, client_id, property_id, booking_id, changes, snapshot, cascaded
  ) values (
    v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, v_category, lower(tg_op),
    tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'booking_id'),
    v_label, v_client, v_property, v_booking, v_changes,
    case when tg_op = 'UPDATE' then null else v_row end,
    v_cascaded
  );

  return null;
exception when others then
  raise warning 'audit_row(%): %', tg_table_name, sqlerrm;
  return null;
end;
$function$;

create trigger audit_property_photos
  after insert or delete on public.property_photos
  for each row execute function public.audit_row();
