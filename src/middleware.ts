import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { VIEW_AS_COOKIE, VIEW_AS_PATH } from "@/lib/view-as";

const PROTECTED_PREFIXES = ["/admin", "/client"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if expired. Required for Server Components,
  // which can't set cookies themselves.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // "View as owner" is read-only, and this is where that holds: every Server
  // Action is a POST, and none reaches the owner portal while the cookie is
  // set. The cookie is path-scoped to /client, so it is only here that it shows.
  const viewAs = path.startsWith(VIEW_AS_PATH) ? request.cookies.get(VIEW_AS_COOKIE)?.value : undefined;
  if (viewAs) {
    if (request.nextUrl.searchParams.get("view_as") === "exit") {
      const back = /^[0-9a-f-]{36}$/i.test(viewAs) ? `/admin/clients/${viewAs}` : "/admin";
      const exit = NextResponse.redirect(new URL(back, request.url));
      exit.cookies.set(VIEW_AS_COOKIE, "", { path: VIEW_AS_PATH, maxAge: 0 });
      return exit;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse("Read-only: you are viewing this portal as its owner.", { status: 403 });
    }
  }

  if (path === "/login" && user) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Only the routes that actually need a session. `getUser()` is a network call
  // to Supabase on every match, so an allow-list beats an exclude-list: the
  // service worker, the manifest, the icons, `/offline` and the password-reset
  // flow are all public and were each paying for a session lookup.
  matcher: ["/", "/login", "/admin/:path*", "/client/:path*"],
};
