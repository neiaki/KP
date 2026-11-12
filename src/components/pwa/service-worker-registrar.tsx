"use client";

import { useEffect } from "react";
import { SW_PATH, isServiceWorkerSupported } from "@/lib/pwa";

/*
 * Mendaftarkan service worker.
 *
 * Kenapa komponen klien: pendaftaran service worker hanya boleh jalan di
 * browser, sedangkan halaman At Cell dirender di server supaya etalase punya
 * isi untuk crawler. Jadi pemanggilannya harus lewat useEffect.
 *
 * Komponen ini sengaja tidak merender apa pun dan tidak memasang tombol
 * Install sendiri. Chrome dan Android sudah menawarkan install begitu
 * manifest dan service worker memenuhi syarat; tombol buatan sendiri hanya
 * menambah satu elemen UI yang harus dijaga konsisten di semua halaman.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!isServiceWorkerSupported()) return;

    /*
     * Service worker tidak didaftarkan di development.
     *
     * Cache-nya menyimpan /_next/static dan memakai cache-first. Di production
     * nama chunk berubah setiap build sehingga cache lama tidak pernah dipakai,
     * tetapi di development nama chunk bisa stabil. Akibatnya browser yang
     * pernah membuka dev server bisa menerima chunk JS lama dari service worker
     * sementara HTML dirender oleh kode baru, dan React melaporkan hydration
     * mismatch yang membingungkan (misalnya atribut width/height gambar).
     *
     * Registrasi lama juga dicabut supaya developer yang sudah terlanjur punya
     * service worker di localhost tidak perlu membersihkan site data manual.
     */
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => undefined);
      return;
    }

    /*
     * Pendaftaran ditunda sampai halaman selesai dimuat, supaya unduhan
     * service worker tidak bersaing dengan gambar produk dan dengan
     * hydration. Di jaringan seluler selisih ini nyata, dan tidak perlu lebih
     * cepat dari itu karena cache aset statis baru berguna sejak kunjungan
     * kedua.
     */
    const daftar = () => {
      navigator.serviceWorker.register(SW_PATH, { scope: "/" }).catch((error: unknown) => {
        // Kegagalan pendaftaran tidak boleh merusak halaman. Yang paling sering
        // terjadi adalah service worker versi lama masih aktif, dan pergantian
        // versi memang diserahkan ke browser.
        console.warn("Service worker At Cell gagal didaftarkan:", error);
      });
    };

    if (document.readyState === "complete") {
      daftar();
      return;
    }
    window.addEventListener("load", daftar, { once: true });
    return () => window.removeEventListener("load", daftar);
  }, []);

  return null;
}
