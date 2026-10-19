import type { ServiceTicket } from "@/types";

export function prependServiceTicket(
  tickets: ServiceTicket[],
  created: ServiceTicket
): ServiceTicket[] {
  return [created, ...tickets];
}

export function getPortalPathState(pathname: string): {
  isLoginPath: boolean;
  isPortalPath: boolean;
} {
  return {
    isLoginPath: pathname.endsWith("/login") || pathname === "/portal/login",
    isPortalPath: pathname.startsWith("/portal"),
  };
}
