import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Gejala laporan: "portal, tidak bisa scroll pakai pad". Di portal, wheel
 * mouse dan gestur trackpad dua jari sama-sama tidak melakukan apa pun,
 * padahal halaman jelas lebih tinggi dari jendela dan scrollbar dokumen
 * masih bisa ditarik.
 *
 * PENYEBAB, diukur di Chromium dan bukan ditebak:
 *
 * <main> portal diberi `overflow-y-auto overscroll-contain`
 * (src/app/(portal)/portal/layout.tsx). Induknya
 * <div className="flex min-w-0 flex-1 flex-col"> tidak punya tinggi pasti,
 * jadi <main> dengan `flex: 1 1 0%` selalu berakhir setinggi isinya
 * sendiri: scrollHeight selalu sama dengan clientHeight. <main> tidak
 * pernah punya satu piksel pun untuk digulir, dia hanya mendeklarasikan
 * dirinya sebagai kotak gulir.
 *
 * `overscroll-behavior: contain` lalu memutus rantai gulir tepat di situ.
 * Browser mencari kotak gulir terdekat mulai dari elemen yang terkena wheel,
 * yang ditemukannya adalah <main> itu, dan contain melarang perpindahan ke
 * dokumen di atasnya. Wheel dan gestur trackpad hilang di <main>, sementara
 * dokumen yang satu-satunya benar-benar bisa digulir tidak pernah menerima
 * event. Scrollbar dokumen tetap bisa ditarik karena itu interaksi pointer,
 * bukan wheel. Itulah sebabnya gejalanya terlihat seperti "bisa pakai
 * scrollbar, tapi tidak pakai pad".
 *
 * Replika DOM dan CSS yang sama diuji di Chromium (1440x900, konten 2200px):
 *   overscroll-contain  -> documentElement.scrollTop = 0   -> TERJEKAK
 *   tanpa contain       -> documentElement.scrollTop = 450 -> MENGULIR
 * Menghapus `h-[100dvh]` dari sidebar tidak mengubah apa pun, jadi sidebar
 * bukan penyebabnya.
 *
 * Sidebar desktop punya cacat yang sama persis (portal-sidebar.tsx): pada
 * `h-[100dvh]` dengan daftar menu normal yang lebih pendek dari 100dvh,
 * sidebar juga tidak punya yang digulir, dan overscroll-contain membuat
 * wheel mati di atas 256px kolom gelap itu.
 *
 * Uji di runner Node ini bersifat statis atas className, bukan uji DOM
 * sungguhan: node:test tidak punya DOM, tidak ada layout engine, dan tidak
 * ada input wheel, sehingga perilaku scroll tidak bisa diukur di sini. Yang
 * dikunci adalah properti yang menutup jebakan tersebut, yaitu kotak yang
 * tidak pernah bisa menggulir tidak boleh memutus rantai gulir.
 */

/**
 * Komentar JSX dihapus dulu sebelum mencari elemen. Tanpa itu pencarian
 * `<main` akan mendarat pada penyebutan <main> di dalam komentar
 * penjelasan file ini, lalu className yang diambil adalah contoh milik
 * area publik yang juga dikutip di komentar itu. Ujinya jadi hijau
 * walaupun regression ada, jadi komentar tidak boleh ikut dicari.
 */
function stripJsxComments(source: string): string {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/**
 * ClassName elemen JSX pertama dengan tag yang diminta. `mustInclude`
 * jadi pembeda ketika satu tag muncul lebih dari sekali, misalnya ada dua
 * <aside> di portal-sidebar.tsx.
 */
function classNameOf(source: string, tag: string, mustInclude: string): string {
  const clean = stripJsxComments(source);
  const marker = "<" + tag;
  const at = clean.indexOf(marker);
  assert.notEqual(at, -1, `elemen ${marker} tidak ditemukan`);
  const open = clean.indexOf("className=", at);
  assert.notEqual(open, -1, `className setelah ${marker} tidak ditemukan`);
  const rest = clean.slice(open + "className=".length);
  let classes: string;
  if (rest[0] === '"') {
    classes = rest.slice(1, rest.indexOf('"', 1));
  } else {
    // Bentuk template literal className={`...`}
    const end = rest.indexOf("`}", 1);
    assert.notEqual(end, -1, "className berbasis template literal tidak terbaca");
    classes = rest.slice(1, end).replace(/\\"/g, '"');
  }
  assert.ok(
    classes.includes(mustInclude),
    `${marker} yang diambil harus memuat "${mustInclude}" supaya bukan elemen ` +
      `lain dengan tag sama. Yang ditemukan: ${classes}`
  );
  return classes;
}

const portalLayout = readFileSync(
  new URL("../src/app/(portal)/portal/layout.tsx", import.meta.url),
  "utf8"
);
const portalSidebar = readFileSync(
  new URL("../src/components/portal/portal-sidebar.tsx", import.meta.url),
  "utf8"
);

const chainBreakers = ["overscroll-contain", "overscroll-none"];

test("<main> portal tidak memutus rantai gulir di kotak yang tak pernah menggulir", () => {
  const main = classNameOf(portalLayout, "main", "pb-[calc(2.5rem");
  const found = chainBreakers.filter((c) => main.split(/\s+/).includes(c));
  assert.deepEqual(
    found,
    [],
    "<main> portal tidak boleh memakai overscroll-contain atau overscroll-none: " +
      "tingginya mengikuti isi sehingga tidak pernah bisa digulir, dan contain " +
      "membuat wheel serta trackpad mati sebelum sampai dokumen. Ditemukan: " +
      found.join(", ")
  );
});

test("<main> portal tidak lagi mendeklarasikan diri kotak gulir yang kosong", () => {
  const main = classNameOf(portalLayout, "main", "pb-[calc(2.5rem");
  const tokens = main.split(/\s+/);
  const declaresScrollBox = [
    "overflow-y-auto",
    "overflow-auto",
    "overflow-y-scroll",
  ].filter((c) => tokens.includes(c));
  assert.deepEqual(
    declaresScrollBox,
    [],
    "<main> portal tidak boleh punya " + declaresScrollBox.join(", ") + ": tidak " +
      "ada tinggi tetap di atasnya, jadi kotak itu tidak pernah punya isian " +
      "yang melebihi tingginya dan hanya menjadi jebakan scroll."
  );
  // Pintu keluar yang dipakai area publik: dokumen yang menggulir, <main>
  // hanya jadi kolom konten yang mengisi sisa baris.
  assert.ok(
    tokens.includes("flex-1"),
    "<main> portal harus tetap mengisi sisa lebar baris"
  );
});

test("sidebar desktop boleh menggulir sendiri tapi tidak boleh memutus rantai gulir", () => {
  // Sidebar desktop adalah <aside> pertama; yang kedua drawer seluler dan
  // memang boleh menahan rantai gulir, jadi tag sama harus dibedakan.
  const aside = classNameOf(portalSidebar, "aside", "lg:flex");
  const tokens = aside.split(/\s+/);
  // Menu panjang di layar pendek memang harus tetap bisa digulir di sidebar,
  // lihat komentar desain di portal-sidebar.tsx.
  assert.ok(
    tokens.includes("overflow-y-auto"),
    "sidebar desktop harus tetap bisa menggulir sendiri saat daftar menu panjang"
  );
  // Begitu daftar menu normal lebih pendek dari 100dvh, sidebar tidak punya
  // yang digulir, dan contain membuat wheel mati di atas kolom gelap.
  const found = chainBreakers.filter((c) => tokens.includes(c));
  assert.deepEqual(
    found,
    [],
    "sidebar desktop tidak boleh memakai overscroll-contain atau overscroll-none: " +
      "saat daftar menu lebih pendek dari 100dvh sidebar tidak bisa menggulir, " +
      "lalu contain memutus wheel sebelum sampai dokumen. Ditemukan: " +
      found.join(", ")
  );
});

test("hanya kotak yang tak pernah menggulir yang kehilangan overscroll-contain", () => {
  // Dialog punya tinggi tetap dan isian yang melebihi tinggi itu, jadi di sana
  // rantai gulir memang harus ditahan dan overscroll-contain tetap benar.
  const dialogs = [
    "src/app/(portal)/portal/service/page.tsx",
    "src/app/(portal)/portal/inventory/page.tsx",
    "src/app/(portal)/portal/products/page.tsx",
    "src/app/(portal)/portal/staff/page.tsx",
    "src/app/(portal)/portal/pos/page.tsx",
  ];
  for (const rel of dialogs) {
    const src = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
    assert.ok(
      src.includes("overscroll-contain"),
      rel + " punya dialog berbatas tinggi yang masih harus menahan rantai gulir"
    );
  }
  // Drawer seluler juga: inset-y-0 mengunci tingginya dan body dikunci scroll
  // selama drawer terbuka, lihat useEffect mobileOpen di portal-sidebar.tsx.
  assert.ok(
    portalSidebar.includes("overscroll-contain"),
    "drawer seluler dengan body scroll lock masih boleh menahan rantai gulir"
  );
});
