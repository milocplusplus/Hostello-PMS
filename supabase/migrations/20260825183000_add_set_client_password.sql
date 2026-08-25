-- Let admins set a client's portal password directly.
--
-- Client logins use @hostello-clients.pk placeholder addresses that receive no
-- mail, so Supabase's recovery email can never reach the owner and the
-- forgot-password flow is a dead end for them. This is the way back in: an
-- admin sets the password and hands it over.
--
-- Same shape as create_client_login — SECURITY DEFINER, admin-only, writes the
-- bcrypt hash straight into auth.users.

-- create_client_login was broken: pgcrypto lives in the `extensions` schema,
-- but the function pins search_path to 'public, auth', so crypt()/gen_salt()
-- could not resolve and every "Create login" failed with
-- `function gen_salt(unknown) does not exist`. Same root cause would hit the
-- new function, so fix it where both can see it.
alter function public.create_client_login(uuid, text, text, text)
  set search_path to 'public', 'auth', 'extensions';

create or replace function public.set_client_password(p_client_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_user_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Only admins can set client passwords';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  select c.owner_user_id into v_user_id
  from public.clients c
  where c.id = p_client_id;

  if v_user_id is null then
    raise exception 'This client has no login yet';
  end if;

  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  -- The old password must not survive in a live session.
  delete from auth.sessions where user_id = v_user_id;
end;
$function$;

-- Admin-only RPC: keep it off the anonymous REST surface, like the other two.
-- `revoke ... from anon` alone is not enough — a new function carries a default
-- PUBLIC grant that anon inherits, so revoke PUBLIC and hand EXECUTE back to
-- `authenticated`, the role the admin's Server Action session actually uses.
revoke execute on function public.set_client_password(uuid, text) from public, anon;
grant execute on function public.set_client_password(uuid, text) to authenticated;
