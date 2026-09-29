import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Gejala laporan: "setelah daftar tiket baru tidak ada" = setelah mendaftarkan
 * tiket baru, tiket itu tidak muncul di daftar sampai ada refresh lain.
 *
 * Daftar tiket di src/app/(portal)/portal/service/page.tsx bukan server
 * component: ia "use client" dan seluruh isinya datang dari useStore()
 * (page.tsx:34). Jadi revalidatePath("/portal/service") di
 * src/lib/actions/service.ts:92 tidak menyentuh daftar yang dilihat pengguna;
 * yang menentukan isi daftar adalah state client di src/lib/store.ts.
 *
 * Yang bikin tiket hilang ada dua, dan keduanya harus tetap tertutup:
 *
 * 1. Insert optimistis. Both branches of createServiceTicket prepend the new
 *    ticket, so the list shows it immediately without waiting for a refetch.
 *    Ini yang membuat daftar benar sejak menit pertama.
 *
 * 2. Tidak ada reload yang menimpa. Dulu loadLiveData punya dependensi
 *    pathname mentah, sehingga setiap perpindahan halaman di portal
 *    menjalankan ulang getPortalSnapshot(). Satu frame setelah
 *    router.push("/portal/service") (service/new/page.tsx:71), snapshot itu
 *    menulis ulang serviceTickets secara last-writer-wins lewat
 *    applyPortalSnapshot, sehingga tiket yang baru didaftarkan hilang lagi
 *    tepat seperti semula. Reload penuh berbeda: ia me-remount layout, jadi
 *    snapshot-nya dibaca dari nol dan tiketnya ada. Itu persis bentuk
 *    gejala "baru muncul setelah refresh".
 *
 * Uji ini menjaga kedua syarat. Ia adalah penjaga call site, bukan uji DOM:
 * store adalah React hook yang mengimpor next/navigation, jadi tidak bisa
 * diimpor dan dieksekusi di runner Node. Yang dikunci di sini adalah
 * invarian yang membuat tiket baru tetap terlihat, yaitu insert optimistis
 * tidak boleh dihapus dan dependensi reload tidak boleh kembali memakai
 * pathname mentah.
 */

const store = readFileSync(
  new URL("../src/lib/store.ts", import.meta.url),
  "utf8"
);
const serviceAction = readFileSync(
  new URL("../src/lib/actions/service.ts", import.meta.url),
  "utf8"
);

/** Badan fungsi createServiceTicket di store, dari deklarasi sampai penutupnya. */
function createServiceTicketBody(): string {
  const start = store.indexOf("const createServiceTicket = async");
  assert.notEqual(start, -1, "createServiceTicket tidak ditemukan di store");
  // Fungsi ini diakhiri baris "  };" di level indentasi dua.
  const end = store.indexOf("\n  };", start);
  assert.notEqual(end, -1, "penutup createServiceTicket tidak ditemukan");
  return store.slice(start, end);
}

/**
 * Seluruh argumen useCallback untuk loadLiveData, dihitung dengan
 * menyeimbangkan kurung. Pencarian "]);" biasa tidak bisa dipakai karena
 * badan callback sendiri penuh panggilan yang ditutup "]);" lebih dulu,
 * sehingga hasilnya terpotong sebelum mencapai larik dependensi.
 */
function loadLiveDataArgs(): string {
  const head = "const loadLiveData = useCallback(";
  const start = store.indexOf(head);
  assert.notEqual(start, -1, "loadLiveData tidak ditemukan di store");
  const open = start + head.length - 1;
  let depth = 0;
  for (let i = open; i < store.length; i++) {
    if (store[i] === "(") depth++;
    else if (store[i] === ")") {
      depth--;
      if (depth === 0) return store.slice(open + 1, i);
    }
  }
  throw new Error("useCallback loadLiveData tidak pernah ditutup");
}

test("createServiceTicket menaruh tiket baru di depan daftar seketika", () => {
  const body = createServiceTicketBody();
  // Cabang live: setelah server action mengembalikan baris yang baru dibuat.
  assert.match(
    body,
    /setServiceTickets\(\(prev\) => \[created, \.\.\.prev\]\)/,
    "cabang live wajib prepend tiket hasil createTicketAction, kalau tidak " +
      "tiket baru hanya terlihat setelah ada refetch"
  );
  // Cabang demo: prepend yang sama, sekaligus menulis ke localStorage.
  assert.match(
    body,
    /const updated = \[newTicket, \.\.\.prev\]/,
    "cabang demo wajib menaruh tiket baru di depan array yang ada"
  );
});

test("tiket baru juga disimpan ke localStorage pada cabang demo", () => {
  const body = createServiceTicketBody();
  assert.match(
    body,
    /localStorage\.setItem\(\s*STORAGE_KEYS\.TICKETS,\s*JSON\.stringify\(updated\)\s*\)/,
    "localStorage harus ditulis di dalam updater yang sama, supaya effect " +
      "yang membaca ulang localStorage tidak mengembalikan daftar lama"
  );
});

test("reload snapshot tidak lagi ikut jalan pada setiap perpindahan halaman", () => {
  const args = loadLiveDataArgs();
  assert.doesNotMatch(
    args,
    /\[pathname\]/,
    "dependensi pathname mentah membuat setiap navigasi memicu " +
      "getPortalSnapshot, dan applyPortalSnapshot lalu menimpa tiket yang " +
      "baru didaftarkan. Pakai penentu yang benar-benar memengaruhi hasil."
  );
  // Yang boleh jadi dependensi adalah penentu yang dihitung dari pathname,
  // yaitu apakah ini halaman login dan apakah ini area portal.
  assert.match(
    args,
    /\[isLoginPath, isPortalPath\]/,
    "dependensi reload harus login/portal, bukan pathname mentah"
  );
});

test("effect pemanggil loadLiveData tetap bergantung pada callback itu", () => {
  // Kalau dependensinya diubah jadi nilai lain, refetch bisa berhenti total
  // dan daftar jadi basi setelah perubahan data dari server.
  assert.match(
    store,
    /\}, \[loadLiveData\]\);/,
    "effect pemanggil loadLiveData harus bergantung pada loadLiveData"
  );
});

test("daftar tiket tidak disaring, dipotong, atau diurutkan ulang sebelum dirender", () => {
  const listPage = readFileSync(
    new URL("../src/app/(portal)/portal/service/page.tsx", import.meta.url),
    "utf8"
  );
  // Tiket baru masuk sebagai elemen pertama. Kalau ada pengurutan atau
  // pemotongan di antara store dan grid, dia bisa tersingkir dari layar.
  const between = listPage.slice(
    listPage.indexOf("const filteredTickets"),
    listPage.indexOf("filteredTickets.map")
  );
  assert.doesNotMatch(between, /\.sort\(/, "daftar tiket tidak boleh diurutkan ulang");
  assert.doesNotMatch(between, /\.slice\(/, "daftar tiket tidak boleh dipotong");
  assert.doesNotMatch(between, /\.limit\(/, "daftar tiket tidak boleh dibatasi");
  // Saringan yang ada hanya pencarian dan status, dan keduanya default yang
  // selalu lolos untuk tiket baru.
  assert.match(
    listPage,
    /useState\(""\)/,
    "pencarian harus mulai kosong supaya tiket baru tidak tersaring kata kunci"
  );
  assert.match(
    listPage,
    /useState<string>\("all"\)/,
    "filter status harus mulai di semua supaya tiket baru tidak tersaring status"
  );
});

test("createTicket tetap mendaftarkan tiket di path yang sama dengan pembaruan", () => {
  // Pola yang dipakai neighbouring action: updateTicket dan executeSale
  // sama-sama mendaftarkan path yang mereka ubah. createTicket harus
  // mendaftarkan /portal/service, kalau tidak daftar yang dirender ulang
  // tetap basi.
  assert.match(
    serviceAction,
    /export async function createTicket[\s\S]*?revalidatePath\("\/portal\/service"\)/,
    "createTicket harus mendaftarkan ulang /portal/service"
  );
});
