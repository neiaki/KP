import { redirect } from "next/navigation";

/**
 * URL lama. Login staf sekarang mengikuti locale publik di /id/login
 * dan /en/login. Redirect permanen di bawah menjaga bookmark dan
 * subdomain login tetap jalan.
 */
export default function PortalLoginRedirect() {
  redirect("/id/login");
}
