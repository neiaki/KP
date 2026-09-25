import type { UserRole } from "@/types";

export function defaultPortalPath(role: UserRole): string {
  if (role === "admin") return "/portal/dashboard";
  if (role === "sales") return "/portal/pos";
  if (role === "technician") return "/portal/service";
  return "/portal/account";
}

export function isAuthSessionMissingError(
  error: { name?: string } | null | undefined
): boolean {
  return !error || error.name === "AuthSessionMissingError";
}

export function isPortalLoginPath(pathname: string): boolean {
  return (
    pathname === "/id/login" ||
    pathname.startsWith("/id/login/") ||
    pathname === "/en/login" ||
    pathname.startsWith("/en/login/") ||
    pathname === "/portal/login" ||
    pathname.startsWith("/portal/login/")
  );
}

/**
 * Normalisasi path internal setelah proxy menerima subdomain login.
 * Browser tetap melihat URL bersih, tetapi guard harus memakai path portal
 * yang benar-benar dilayani Next.js.
 */
export function resolveEffectivePortalPath(
  pathname: string,
  isLoginSubdomain: boolean
): string {
  if (!isLoginSubdomain) return pathname;
  if (pathname === "/" || pathname === "") return "/id/login";
  if (isPortalLoginPath(pathname)) {
    return pathname.startsWith("/portal/login") ? "/id/login" : pathname;
  }
  if (/^\/(id|en)(?:\/|$)/.test(pathname)) return pathname;
  return pathname.startsWith("/portal") ? pathname : `/portal${pathname}`;
}

export function canAccessPortalPath(pathname: string, role: UserRole): boolean {
  if (pathname.startsWith("/portal/account")) return true;
  if (
    pathname.startsWith("/portal/dashboard") ||
    pathname.startsWith("/portal/products") ||
    pathname.startsWith("/portal/settings") ||
    pathname.startsWith("/portal/staff") ||
    pathname.startsWith("/portal/reports")
  ) {
    return role === "admin";
  }
  if (pathname.startsWith("/portal/pos") || pathname.startsWith("/portal/inventory")) {
    return role === "admin" || role === "sales";
  }
  if (pathname.startsWith("/portal/service")) {
    return role === "admin" || role === "sales" || role === "technician";
  }
  return role === "admin";
}
