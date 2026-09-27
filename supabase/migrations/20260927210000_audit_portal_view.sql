-- "View as owner" changes no row, so no trigger sees it. The admin action that
-- opens the view records it here instead; the owner is not told.

create or replace function public.log_portal_view(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_name text;
begin
  if not is_admin() then
    raise exception 'Only the owner can view a client''s portal';
  end if;

  select name into v_name from clients where id = p_client_id;
  if not found then
    raise exception 'Client not found';
  end if;

  select * into v_actor from audit_actor(auth.uid());
  insert into audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label, client_id)
  values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'client', 'viewed_portal', 'clients',
          p_client_id::text, v_name, p_client_id);
end;
$$;

revoke all on function public.log_portal_view(uuid) from public, anon;
grant execute on function public.log_portal_view(uuid) to authenticated;
