import { ImageResponse } from "next/og";
import { APPLE_ICON_SIZE } from "@/lib/pwa";

/*
 * apple-touch-icon untuk iOS.
 *
 * iOS tidak memakai manifest untuk icon layar utama. Safari membaca
 * <link rel="apple-touch-icon">, dan tanpa berkas ini app yang ter-install
 * akan memakai screenshot halaman sebagai ikon, yaitu gambar berteks kecil
 * yang tidak terbaca di layar 60px.
 *
 * iOS juga tidak mendukung maskable, dan selalu memotong ikon jadi rounded
 * rectangle. Jadi ikon ini sengaja dibuat tanpa ruang aman: iOS yang
 * memotong, bukan Android.
 */

export const contentType = "image/png";
export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE };

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // iOS menempel ikon di wall paper, jadi latar dibuat aksen pekat
          // dan tidak ada margin putih yang akan menyatu dengan wall paper.
          backgroundColor: "#0b4ed8",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "66%",
            height: "66%",
            borderRadius: "26%",
            backgroundColor: "#ffffff",
            color: "#0b4ed8",
            fontSize: "50%",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          AT
        </div>
      </div>
    ),
    { ...size }
  );
}
