import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/error-state";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
  description:
    "Alamat yang kamu buka tidak ketemu di At Cell. Kembali ke beranda, lihat stok HP, atau lacak servis kamu.",
};

export default function NotFound() {
  return (
    <ErrorState
      code="404"
      title="Halaman ini tidak ketemu"
      description="Alamatnya mungkin salah ketik atau halamannya sudah dihapus. Stok dan data servis kamu tetap aman."
      image="/products/iphone-duo.jpg"
      imageAlt="Dua unit iPhone di etalase At Cell"
      imageCaption="Yang nyasar cuma halaman ini. Stok di etalase tetap rapi."
      primary={{ href: "/id", label: "Kembali ke beranda" }}
      secondary={[
        { href: "/id/catalog", label: "Lihat stok" },
        { href: "/id/tracking", label: "Lacak servis" },
      ]}
      waText="Halo At Cell, saya nyasar ke halaman yang tidak ketemu. Minta info dong."
      helpText="Chat WA toko di jam buka 10.00 sampai 21.00, tim kami bantu arahkan."
      langNote={
        <>
          Looking for the English page? Start from the{" "}
          <Link href="/en" className="font-bold text-accent underline-offset-4 hover:underline">
            homepage in English
          </Link>
          .
        </>
      }
    />
  );
}
