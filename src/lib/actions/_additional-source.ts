/**
 * Sumber data tambahan untuk snapshot portal.
 *
 * getPortalSnapshot punya sumber utama yang dibaca bersamaan lewat
 * Promise.all, lalu sumber tambahan seperti etalase publik untuk customer
 * dan pengaturan toko. Sumber tambahan tidak boleh menjatuhkan seluruh
 * snapshot dengan error mentah: kegagalan harus berubah menjadi ActionResult
 * yang bisa ditampilkan. Loader yang melempar error juga harus tertangkap di
 * sini, bukan lolos ke render.
 *
 * Modul ini sengaja tidak mengimpor _helpers atau next/headers supaya bisa
 * diuji langsung dengan runner Node tanpa runtime Next.
 */

export type AdditionalSourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function loadAdditionalSource<T>(
  loader: () => Promise<AdditionalSourceResult<T>>,
  fallbackMessage: string
): Promise<AdditionalSourceResult<T>> {
  try {
    return await loader();
  } catch {
    return { ok: false, error: fallbackMessage };
  }
}
