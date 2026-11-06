import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const AUTH_TIMEOUT_MS = 2_500;

const PROTECTED_ROUTE_PREFIXES = [
  "/closet",
  "/profile",
  "/saved",
  "/history",
  "/shopping",
  "/travel",
];

function redirectToLogin(
  request: NextRequest,
  pathname: string,
  error?: string
) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = PROTECTED_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Public pages must remain available when the auth provider is degraded.
  // Protected pages still validate the session below with a bounded timeout.
  if (!isProtectedRoute) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(request, pathname, "auth_unavailable");
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let user: User | null = null;

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Supabase auth request timed out")),
          AUTH_TIMEOUT_MS
        );
      }),
    ]);
    user = result.data.user;
  } catch {
    return redirectToLogin(request, pathname, "auth_unavailable");
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!user && isProtectedRoute) {
    return redirectToLogin(request, pathname);
  }

  return supabaseResponse;
}
