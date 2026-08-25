-- Take the admin-only RPCs off the anonymous REST surface.
--
-- Both already refuse a non-admin caller internally (auth.uid() must map to a
-- profile with role='admin'), so this is defence in depth rather than a fix for
-- a live hole. `authenticated` keeps EXECUTE because the admin UI calls both
-- through a Server Action carrying the signed-in admin's session.
revoke execute on function public.create_client_login(uuid, text, text, text) from anon;
revoke execute on function public.get_client_login_email(uuid) from anon;

-- Event-trigger function. It is invoked by the DDL event machinery, never by a
-- client, and pg_event_trigger_ddl_commands() errors outside that context anyway.
-- Nothing should be able to reach it over the API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- public.is_admin() is deliberately left executable by anon and authenticated:
-- every "admin full access" RLS policy calls it, and those policies are evaluated
-- as the querying role. Revoking it would make ordinary anonymous reads fail with
-- a permission error instead of simply returning no rows. Verified after applying:
-- anon SELECT on properties/clients/bookings/profiles still returns 200 [].
