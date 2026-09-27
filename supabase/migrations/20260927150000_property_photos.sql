-- Property photos: one optional cover photo per unit.
--
-- The file lives in the public `property-photos` bucket at
-- `<client_id>/<property_id>-<timestamp>.<ext>`; `properties.photo_path` names
-- it. Public-read because these are listing photos shown on every card, and
-- signing a URL per card per page would buy nothing. Writing is narrow: the
-- admin anywhere, an owner only inside their own client folder, and the path
-- is set through `set_property_photo()` so an owner never needs UPDATE on
-- `properties` (whose other columns are deal terms).

alter table public.properties add column if not exists photo_path text;

-- Appended last: CREATE OR REPLACE VIEW may only add columns at the end.
create or replace view public.properties_v with (security_invoker = false) as
 select id,
    client_id,
    name,
    location,
    city,
    type,
    status,
    created_at,
    province,
        case
            when not is_ops() then stack_rate
            else null::numeric
        end as stack_rate,
        case
            when not is_ops() then short_stay_stack_rate
            else null::numeric
        end as short_stay_stack_rate,
    max_guests,
    nightly_rate,
    short_stay_rate,
    photo_path
   from properties p
  where is_staff() or (exists ( select 1
           from clients c
          where c.id = p.client_id and c.owner_user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos',
  'property-photos',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "property photos: admin writes"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos' and is_admin());

create policy "property photos: admin removes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'property-photos' and is_admin());

create policy "property photos: owner writes own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'property-photos'
    and exists (
      select 1 from clients c
      where c.owner_user_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

create policy "property photos: owner removes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'property-photos'
    and exists (
      select 1 from clients c
      where c.owner_user_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

-- Sets (or clears, with null) a unit's photo. Returns the path it replaced so
-- the caller can delete the old file. The path must sit in the unit's own
-- client folder, whoever is setting it.
create or replace function public.set_property_photo(p_property_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_old text;
begin
  select client_id, photo_path into v_client, v_old
  from properties where id = p_property_id;

  if v_client is null then
    raise exception 'Property not found';
  end if;

  if not (
    is_admin()
    or exists (select 1 from clients c where c.id = v_client and c.owner_user_id = auth.uid())
  ) then
    raise exception 'Not allowed to change this property''s photo';
  end if;

  if p_path is not null and split_part(p_path, '/', 1) <> v_client::text then
    raise exception 'Photo path must be in the property''s own folder';
  end if;

  update properties set photo_path = p_path where id = p_property_id;
  return v_old;
end;
$$;

revoke all on function public.set_property_photo(uuid, text) from public, anon;
grant execute on function public.set_property_photo(uuid, text) to authenticated;
