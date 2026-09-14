import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";

  // Check if request comes from login subdomain (e.g. login.atcell.my.id or login.localhost:3000)
  const isLoginSubdomain =
    hostname.startsWith("login.") ||
    hostname.startsWith("portal.");

  let response: NextResponse;
  if (isLoginSubdomain) {
    // If requesting root of login subdomain, rewrite to /portal/login
    if (pathname === "/" || pathname === "") {
      response = NextResponse.rewrite(new URL("/portal/login", request.url));
    } else if (!pathname.startsWith("/portal")) {
      // If not already prefixed with /portal, rewrite to /portal/...
      response = NextResponse.rewrite(new URL(`/portal${pathname}`, request.url));
    } else {
      response = NextResponse.next();
    }
  } else if (pathname === "/") {
    // Root redirect to default locale /id
    return NextResponse.redirect(new URL("/id", request.url));
  } else {
    response = NextResponse.next();
  }

  // Refresh sesi Supabase sebelum request diproses (pola middleware-first).
  // Bila env belum diisi (mode demo mock), lewati tanpa error.
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return parseCookieHeader(request.cookies.toString());
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabase.auth.getClaims();
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
