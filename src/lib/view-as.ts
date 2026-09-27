/**
 * "View as owner" — the cookie's name and scope, shared by the middleware
 * (which refuses writes while it is set) and `auth.ts` (which honours it for
 * the admin). Kept apart from `auth.ts` so the middleware bundle stays small.
 *
 * Scoped to `/client`: it only travels with owner-portal requests, so the
 * admin side never sees it and keeps working normally.
 */
export const VIEW_AS_COOKIE = "hostello_view_as";
export const VIEW_AS_PATH = "/client";
/** `/client?view_as=exit` ends it; handled in the middleware, which can clear cookies. */
export const VIEW_AS_EXIT_HREF = "/client?view_as=exit";
