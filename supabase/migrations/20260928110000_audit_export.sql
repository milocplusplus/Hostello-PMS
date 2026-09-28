-- A data export changes no row, so no trigger sees it; the export action
-- records it here. Admin only, like the export itself.

create or replace function public.log_export(p_summary text, p_client_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
begin
  if not is_admin() then
    raise exception 'Only the owner can export data';
  end if;

  select * into v_actor from audit_actor(auth.uid());
  insert into audit_log (actor_id, actor_name, actor_role, category, action, label, client_id)
  values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'settings', 'exported',
          left(p_summary, 300), p_client_id);
end;
$$;

revoke all on function public.log_export(text, uuid) from public, anon;
grant execute on function public.log_export(text, uuid) to authenticated;
