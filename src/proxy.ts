import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabaseCookieDomain,
  getSupabaseUrl,
} from "@/lib/supabase/config";
import {
  canAccessPortalPath,
  defaultPortalPath,
  isPortalLoginPath,
  isAuthSessionMissingError,
} from "@/lib/access";
import type { UserRole } from "@/types";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = (request.headers.get("host") || "").toLowerCase().split(":")[0];

  // Check if request comes from login subdomain (e.g. login.atcell.my.id or login.localhost:3000)
  const isLoginSubdomain =
    hostname.startsWith("login.") ||
    hostname.startsWith("portal.");

  let response: NextResponse;
  let effectivePathname = pathname;
  if (isLoginSubdomain) {
    // Subdomain login mengarah ke halaman login publik ber-locale.
    // /portal/login lama ikut dipetakan ke /id/login agar bookmark tetap jalan.
    if (pathname === "/" || pathname === "") {
      response = NextResponse.rewrite(new URL("/id/login", request.url));
      effectivePathname = "/id/login";
    } else if (isPortalLoginPath(pathname)) {
      if (pathname === "/portal/login" || pathname.startsWith("/portal/login/")) {
        response = NextResponse.rewrite(
          new URL(pathname.replace("/portal/login", "/id/login"), request.url)
        );
        effectivePathname = "/id/login";
      } else {
        // Login locale pada subdomain boleh dilayani tanpa rewrite.
        response = NextResponse.next();
        effectivePathname = pathname;
      }
    } else if (/^\/(id|en)(?:\/|$)/.test(pathname)) {
      response = NextResponse.next();
      effectivePathname = pathname;
    } else if (!pathname.startsWith("/portal")) {
      // URL tetap terlihat bersih di browser, tetapi guard memakai path internal.
      const target = new URL(`/portal${pathname}`, request.url);
      target.search = request.nextUrl.search;
      response = NextResponse.rewrite(target);
      effectivePathname = `/portal${pathname}`;
    } else {
      response = NextResponse.next();
    }
  } else if (pathname === "/" || pathname === "") {
    // Root redirect to default locale /id
    return NextResponse.redirect(new URL("/id", request.url));
  } else if (pathname === "/portal/login" || pathname.startsWith("/portal/login/")) {
    // URL login lama pindah ke rute publik ber-locale. Query string dipertahankan.
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace("/portal/login", "/id/login");
    return NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  // Refresh sesi Supabase sebelum request diproses. Guard hanya aktif ketika
  // env live terpasang; mode demo lokal tetap bisa memakai data mock.
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (supabaseUrl && supabaseAnonKey) {
    const cookieDomain = getSupabaseCookieDomain();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return parseCookieHeader(request.cookies.toString());
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              cookieDomain ? { ...options, domain: cookieDomain } : options
            );
          });
        },
      },
    });

    const isPublicLoginPath = isPortalLoginPath(effectivePathname);
    const isPortalRequest =
      effectivePathname.startsWith("/portal") ||
      (isLoginSubdomain && !isPublicLoginPath);

    if (isPortalRequest && !isPublicLoginPath) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // getUser() mengembalikan AuthSessionMissingError ketika cookie tidak
      // ada. Itu kondisi normal untuk request anonim, bukan kegagalan backend.
      const sessionMissing = isAuthSessionMissingError(userError);
      if (userError && !sessionMissing) {
        const unavailable = new NextResponse("Backend autentikasi sedang tidak tersedia.", {
          status: 503,
        });
        copyCookies(response, unavailable);
        return unavailable;
      }

      if (!user) {
        const loginUrl = new URL("/id/login", request.url);
        loginUrl.searchParams.set(
          "next",
          `${effectivePathname}${request.nextUrl.search}`
        );
        const redirect = NextResponse.redirect(loginUrl);
        copyCookies(response, redirect);
        return redirect;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        const forbidden = new NextResponse("Profil pengguna tidak ditemukan.", {
          status: 403,
        });
        copyCookies(response, forbidden);
        return forbidden;
      }

      const role = profile.role as UserRole;
      if (!canAccessPortalPath(effectivePathname, role)) {
        const redirect = NextResponse.redirect(new URL(defaultPortalPath(role), request.url));
        copyCookies(response, redirect);
        return redirect;
      }
    } else {
      await supabase.auth.getClaims();
    }
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
