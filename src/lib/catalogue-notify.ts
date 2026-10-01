import { formatIDR } from "./utils.ts";
import type { Locale } from "@/lib/translations";
import type { Product } from "@/types";

/*
 * Isi chat WhatsApp untuk pelanggan yang menekan "Minta dikabari" pada model
 * yang belum punya unit di toko.
 *
 * Modul ini sengaja dipisah dari komponen, sama seperti
 * src/lib/trade-in-request.ts, supaya aturan yang mengikat bisa diuji tanpa
 * merender React. Yang diimpor cuma formatIDR; sisanya tipe saja, jadi modul
 * ini tidak menarik apa pun yang berat ke client bundle.
 *
 * Aturan yang dipegang modul ini: pesan WA selalu menyebut model yang sedang
 * dilihat. Kalau nama model atau id produknya tidak berbentuk, fungsi
 * mengembalikan null supaya komponen tidak pernah mengirim pesan dengan nama
 * karangan, persis seperti resolveTradeInTarget menolak id asal untuk unit
 * trade-in.
 */

/** Model etalase yang sedang dilihat pelanggan ketika menekan Minta dikabari. */
export type NotifyMeTarget = {
  productId: number;
  brand: string;
  modelName: string;
};

/* Id produk di database itu bilangan bulat positif. Baris yang id-nya bukan
   angka tidak berasal dari tabel products, jadi jangan dipakai menebak model. */
const POLA_ID_PRODUK = /^\d+$/;

/**
 * Target dari baris katalog, atau null kalau barisnya tidak layak dipakai.
 *
 * Katalog publik diisi dari snapshot yang membaca tabel products, jadi nama
 * model harusnya selalu ada. Kalau ternyata kosong, tombol Minta dikabari lebih
 * baik hilang daripada mengirim "Halo At Cell, kabari saya kalau  sudah ada
 * unitnya", karena counter tidak akan bisa mencari produknya.
 */
export function notifyMeTargetFrom(product: Product): NotifyMeTarget | null {
  if (!POLA_ID_PRODUK.test(String(product.id))) return null;
  const brand = product.brand.trim();
  const modelName = product.model_name.trim();
  if (brand === "" || modelName === "") return null;
  return { productId: product.id, brand, modelName };
}

/** Copy bagian model tanpa unit untuk etalase publik. */
export type NoUnitSectionCopy = {
  /** Label pada kartu, di atas nama model. */
  badge: string;
  heading: string;
  intro: string;
  /** Menjelaskan tombol WA bukan tombol beli. */
  requestNote: string;
  /** Penjelasan untuk angka default_price di kartu. */
  priceCaveat: string;
  /** Teks tombol WA. */
  notifyLabel: string;
};

/**
 * Copy bagian model tanpa unit.
 *
 * Kata "habis" sengaja tidak dipakai untuk badge model tanpa unit. Habis
 * berarti ada yang pernah turun dari rak, sedangkan model ini belum pernah
 * punya unit sama sekali, jadi pelanggan yang baca "Stok habis" bisa salah
 * mengira model itu pernah dijual di toko.
 *
 * Beranda dan katalog memakai satu fungsi ini supaya keduanya tidak bisa
 * berbeda copy, dan supaya copy baru cukup ditulis di satu tempat.
 */
export function noUnitSectionCopy(locale: Locale): NoUnitSectionCopy {
  return locale === "en"
    ? {
        badge: "No unit yet",
        heading: "New in catalog",
        intro:
          "These models are already in the catalog, but the shop has no unit of them yet, so they cannot be bought right now.",
        requestNote:
          "The button only opens a WhatsApp chat. It asks to be told when a unit arrives, it is not an order.",
        priceCaveat:
          "A reference price, not today's selling price. The selling price is set when the unit is registered.",
        notifyLabel: "Ask me to notify",
      }
    : {
        badge: "Belum ada unit",
        heading: "Baru masuk katalog",
        intro:
          "Model ini sudah masuk katalog, tapi belum ada satu pun unitnya di toko, jadi belum bisa dibeli.",
        requestNote:
          "Tombolnya cuma membuka chat WhatsApp. Minta dikabari begitu unitnya masuk, bukan pesan beli.",
        priceCaveat:
          "Patokan harga acuan, bukan harga jual hari ini. Harga jualnya baru ditentukan saat unit didaftarkan.",
        notifyLabel: "Minta dikabari",
      };
}

/**
 * Copy bagian model yang unitnya habis.
 *
 * Bagian ini berbeda dari noUnitSectionCopy, dan perbedaannya bukan gaya
 * bahasa. Di sini tokonya sudah pernah menjual model ini, jadi "belum ada
 * unit" akan berbohong. Yang jujur adalah modelnya pernah ada di rak dan
 * sekarang tidak, dan itu juga yang harus dibaca pelanggan: barang ini bukan
 * barang yang tidak pernah ada di sini.
 */
export type SoldOutSectionCopy = {
  /** Label pada kartu, di atas nama model. */
  badge: string;
  heading: string;
  intro: string;
  /** Menjelaskan tombol WA bukan tombol beli. */
  requestNote: string;
  /** Penjelasan untuk angka default_price di kartu. */
  priceCaveat: string;
  /** Teks tombol WA. */
  notifyLabel: string;
};

export function soldOutSectionCopy(locale: Locale): SoldOutSectionCopy {
  return locale === "en"
    ? {
        badge: "Sold out",
        heading: "Just sold out",
        intro:
          "The shop has had this model before, but there is no unit on the shelf right now, so it cannot be bought today.",
        requestNote:
          "The button only opens a WhatsApp chat. It asks to be told when a unit arrives, it is not an order.",
        priceCaveat:
          "A reference price, not the price the last unit went for. The selling price is set when the unit is registered.",
        notifyLabel: "Ask me to notify",
      }
    : {
        badge: "Stok habis",
        heading: "Baru saja habis",
        intro:
          "Model ini pernah ada di toko, tapi sekarang tidak ada unitnya di rak, jadi hari ini belum bisa dibeli.",
        requestNote:
          "Tombolnya cuma membuka chat WhatsApp. Minta dikabari begitu unitnya masuk, bukan pesan beli.",
        priceCaveat:
          "Patokan harga acuan, bukan harga jual unit yang terakhir terjual. Harga jualnya baru ditentukan saat unit didaftarkan.",
        notifyLabel: "Minta dikabari",
      };
}

/**
 * Satu pesan chat yang siap dikirim ke nomor WhatsApp toko.
 *
 * Dua hal wajib terbaca oleh counter: model yang ditanyakan, dan bahwa unitnya
 * belum ada. Ditutup kalimat "Belum pesan" supaya chat yang masuk tidak dibaca
 * sebagai pesanan.
 *
 * `alasan` memilih kalimat pembuka yang jujur. "never_had_unit" dipakai untuk
 * model yang belum pernah ada unitnya, "sold_out" untuk model yang pernah ada
 * lalu habis. Default-nya "never_had_unit" supaya pemanggil yang lupa
 * mengirim alasannya tetap dapat kalimat yang tidak mengarang.
 */
export function buildNotifyMeMessage(opts: {
  locale: Locale;
  target: NotifyMeTarget;
  alasan?: "never_had_unit" | "sold_out";
}): string {
  const { locale, target, alasan = "never_had_unit" } = opts;
  const model = `${target.brand} ${target.modelName}`;
  if (alasan === "sold_out") {
    return locale === "en"
      ? `Hello At Cell, I saw ${model} in your catalog, but there is no unit of it on the shelf right now. Please notify me when one arrives. Not booking anything, just asking.`
      : `Halo At Cell, saya lihat ${model} di katalog, tapi sekarang tidak ada unitnya di rak. Tolong kabari saya kalau sudah ada unitnya. Belum pesan, cuma mau tahu.`;
  }
  return locale === "en"
    ? `Hello At Cell, I saw ${model} in your catalog, but there is no unit of it in the shop yet. Please notify me when one arrives. Not booking anything, just asking.`
    : `Halo At Cell, saya lihat ${model} di katalog, tapi unitnya belum ada di toko. Tolong kabari saya kalau sudah ada unitnya. Belum pesan, cuma mau tahu.`;
}

/** Tautan wa.me yang isinya sudah di-encode, siap dipakai di href. */
export function buildNotifyMeHref(opts: {
  locale: Locale;
  waNumber: string;
  target: NotifyMeTarget;
  alasan?: "never_had_unit" | "sold_out";
}): string {
  const text = buildNotifyMeMessage({
    locale: opts.locale,
    target: opts.target,
    alasan: opts.alasan,
  });
  return `https://wa.me/${opts.waNumber}?text=${encodeURIComponent(text)}`;
}

/**
 * Harga acuan yang layak ditulis, atau undefined kalau tidak ada.
 *
 * Satu-satunya tempat yang memutuskan apakah `default_price` boleh sampai ke
 * layar. Dua jalur etalase memakai aturan yang sama: kartu unit second yang
 * menampilkan label "Barunya", dan kartu model tanpa unit yang menampilkan
 * "Perkiraan harga saat unitnya masuk". Sebelum aturan ini dipisah, jalur
 * kedua sudah menjaganya sendiri sementara jalur pertama meloloskan `0` apa
 * adanya, jadi toCardItem bisa mengirim `newPrice: 0` untuk produk yang
 * tokonya memang belum punya harga unit baru. Angka nol itu bukan harga.
 * Menampilkannya berarti mencoret "Barunya Rp0" di samping harga jual yang
 * sebenarnya, dan itu terbaca oleh pembeli sebagai diskon yang rusak.
 *
 * Parameternya `unknown` karena nilainya datang dari database lewat
 * `toNumber`, jadi bentuknya tidak dijamin number meski tipenya sudah number.
 */
export function referencePriceOf(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/**
 * Baris harga untuk model tanpa unit, atau null kalau angkanya belum diisi.
 *
 * default_price adalah patokan harga acuan, bukan harga jual unit yang belum
 * ada. Kalau nilainya nol atau bukan angka, tidak ada harga yang jujur untuk
 * ditulis, jadi komponen menyembunyikan baris ini, bukan menampilkan Rp0 yang
 * terbaca seperti diskon.
 */
export function referencePriceNote(
  defaultPrice: number,
  locale: Locale
): string | null {
  const price = referencePriceOf(defaultPrice);
  if (price === undefined) return null;
  const money = formatIDR(price);
  return locale === "en"
    ? `Estimated price once one arrives ${money}`
    : `Perkiraan harga saat unitnya masuk ${money}`;
}
