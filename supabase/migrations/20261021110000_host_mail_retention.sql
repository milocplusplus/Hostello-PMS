-- A host's forwarded Airbnb emails are read once; keeping every raw email forever would
-- only fill the database. What the email produced (the booking) stays; the email itself
-- is trimmed, then removed. Hostello's own channel inbox (client_id null) is untouched.
-- Applied to the live DB as `host_mail_retention` on 2026-10-21.
create or replace function public.purge_host_mail() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_html int; v_text int; v_rows int;
begin
  -- The styled copy is the bulk of an email and is never needed once it has been read.
  update ota_messages set raw_html = null
   where client_id is not null and raw_html is not null
     and status in ('applied', 'ignored') and coalesce(reviewed_at, received_at) < now() - interval '7 days';
  get diagnostics v_html = row_count;

  update ota_messages set raw_text = null
   where client_id is not null and raw_text is not null
     and status in ('applied', 'ignored') and coalesce(reviewed_at, received_at) < now() - interval '30 days';
  get diagnostics v_text = row_count;

  -- The record itself goes after six months (the booking it made is not touched).
  delete from ota_messages
   where client_id is not null and status in ('applied', 'ignored')
     and received_at < now() - interval '180 days';
  get diagnostics v_rows = row_count;

  return jsonb_build_object('html_cleared', v_html, 'text_cleared', v_text, 'rows_deleted', v_rows);
end $$;
revoke execute on function public.purge_host_mail() from public, anon, authenticated;

select cron.schedule('hostello-host-mail-retention', '20 3 * * *', 'select public.purge_host_mail();');
