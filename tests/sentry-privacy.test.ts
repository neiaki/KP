import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

/*
 * Penjaga privasi untuk integrasi Sentry At Cell.
 *
 * Isi portal (nama, telepon, IMEI, kode tiket, nomor nota) adalah data
 * pelanggan pihak ketiga. Dua sisi Sentry punya bentuk event yang berbeda,
 * jadi keduanya diuji lewat jalur yang sama: berkas instrumentasi
 * benar-benar dieksekusi, Sentry.init dipanggil, lalu opsi yang ia terima
 * dipakai langsung sebagai beforeSend / beforeBreadcrumb.
 *
 * Stub di bawah hanya mencatat apa yang ditulis modul ke slot-nya dan
 * membiarkan modul dieksekusi apa adanya. Tidak ada berkas yang dibaca
 * sebagai teks dan tidak ada regex yang mengunci format kode: kalau kode
 * disusun ulang tapi perilakunya sama, test ini tetap lulus, dan kalau
 * perilakunya berubah, test ini gagal.
 */

type OpsiSentry = Record<string, unknown>;
type Slot = { from: string; options: OpsiSentry };
type Breadcrumb = { category?: string; data?: Record<string, unknown>; [k: string]: unknown };
type EventSentry = { request?: Record<string, unknown>; [k: string]: unknown };
type BeforeSend = (event: EventSentry) => EventSentry | null;
type BeforeBreadcrumb = (breadcrumb: Breadcrumb) => Breadcrumb;

const slots: Slot[] = [];
let sedangDimuat = "";

type HasilResolve = { url: string; shortCircuit?: boolean };
type Resolve = (specifier: string, context?: unknown) => HasilResolve;
type HookLoader = (specifier: string, context: unknown, next: Resolve) => HasilResolve;

/*
 * registerHooks adalah loader hook bawaan Node: sinkron dan berjalan di
 * dalam process, jadi @sentry/nextjs bisa diganti stub tanpa memuat SDK
 * aslinya dan tanpa toolchains tambahan. Diambil lewat createRequire
 * karena @types/node di repo ini masih seri 20 yang belum mengenalinya,
 * sementara runtime-nya sudah mendukung.
 */
const { registerHooks } = createRequire(import.meta.url)("node:module") as {
  registerHooks: (hooks: { resolve: HookLoader }) => void;
};

/*
 * Stub Sentry hanya mencatat opsi init dan meneruskan sisanya apa adanya.
 * Tidak ada toolchains tambahan yang dipakai di sini.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier !== "@sentry/nextjs") return nextResolve(specifier, context);
    const sumber = JSON.stringify(sedangDimuat);
    const stub = `export const init = (options) => {
      globalThis.__sentryPrivacySlots.push({ from: ${sumber}, options });
    };
    export const captureException = () => undefined;
    export default { init, captureException };`;
    return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
  },
});

declare global {
  var __sentryPrivacySlots: Slot[] | undefined;
}

globalThis.__sentryPrivacySlots = slots;

/*
 * Import dinamis, bukan import statis: instrumentation-client.ts memanggil
 * Sentry.init di baris teratas modul, jadi env harus diisi lebih dulu,
 * sedangkan import statis selalu dijalankan sebelum baris mana pun di file
 * ini.
 */
async function opsiServer(): Promise<OpsiSentry> {
  process.env.SENTRY_DSN = "https://example.invalid/1";
  sedangDimuat = "server";
  const { register } = await import("../src/instrumentation.ts");
  await register();
  const slot = slots.filter((s) => s.from === "server").at(-1);
  assert.ok(slot, "Sentry.init tidak dipanggil di src/instrumentation.ts");
  return slot.options;
}

async function opsiClient(): Promise<OpsiSentry> {
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example.invalid/1";
  sedangDimuat = "client";
  await import("../src/instrumentation-client.ts");
  const slot = slots.filter((s) => s.from === "client").at(-1);
  assert.ok(slot, "Sentry.init tidak dipanggil di src/instrumentation-client.ts");
  return slot.options;
}

function ambilBeforeSend(opsi: OpsiSentry): BeforeSend {
  const fn = opsi.beforeSend as BeforeSend | undefined;
  assert.equal(typeof fn, "function", "beforeSend tidak terdaftar");
  return fn!;
}

function ambilBeforeBreadcrumb(opsi: OpsiSentry): BeforeBreadcrumb {
  const fn = opsi.beforeBreadcrumb as BeforeBreadcrumb | undefined;
  assert.equal(typeof fn, "function", "beforeBreadcrumb tidak terdaftar");
  return fn!;
}

/**
 * Bentuk event yang benar-benar dipakai SDK: httpRequestToRequestData di
 * @sentry/core menempelkan url absolut yang masih memuat query string
 * mentah, plus query_string, headers, cookies, dan body, pada satu objek
 * request. Event di bawah adalah tiruan itu, bukan karangan.
 */
function eventLacak(): EventSentry {
  return {
    exception: { values: [{ type: "Error", value: "boom" }] },
    request: {
      url: "https://atcell.my.id/id/tracking?ticket=SRV-2026-0042",
      method: "GET",
      query_string: "ticket=SRV-2026-0042",
      headers: {
        authorization: "Bearer rahasia-sesi",
        cookie: "sb-access-token=jwt-pelanggan",
        "x-api-key": "kunci",
        "user-agent": "Mozilla/5.0",
      },
      cookies: "sb-access-token=jwt-pelanggan",
      data: '{"customerName":"Siti Rahayu","imei":"356938035643809"}',
    },
  };
}

function kirimServer(opsi: OpsiSentry, event: EventSentry): EventSentry {
  return ambilBeforeSend(opsi)(structuredClone(event))!;
}

// --- Server: request.url dan query_string ------------------------------------

test("kode tiket hilang dari request.url, bukan cuma dari query_string", async () => {
  const event = kirimServer(await opsiServer(), eventLacak());
  const request = event.request as Record<string, unknown>;

  // httpRequestToRequestData menempelkan url absolut yang masih memuat query
  // string, jadi url adalah jalur bocor kedua yang harus disaring sendiri.
  assert.equal(request.url, "https://atcell.my.id/id/tracking?ticket=[disensor]");
  assert.equal(request.query_string, "ticket=[disensor]");
  assert.equal(JSON.stringify(event).includes("SRV-2026-0042"), false);
});

test("url relatif, fragment, dan url tanpa query tidak dirusak", async () => {
  const opsi = await opsiServer();

  // Bentuk yang dipakai @sentry/node hanya punya path saat host tidak ada.
  const relatif = kirimServer(opsi, { request: { url: "/id/tracking?ticket=SRV-1" } });
  assert.equal(relatif.request?.url, "/id/tracking?ticket=[disensor]");

  // Fragment harus tetap ada, dan parameter lain tidak ikut hilang.
  const fragmen = kirimServer(opsi, {
    request: { url: "/id/tracking?ticket=SRV-1&page=2#hasil" },
  });
  assert.equal(fragmen.request?.url, "/id/tracking?ticket=[disensor]&page=2#hasil");

  const polos = kirimServer(opsi, { request: { url: "https://atcell.my.id/id" } });
  assert.equal(polos.request?.url, "https://atcell.my.id/id");
});

test("kode tiket disaring pada ketiga bentuk query_string", async () => {
  const opsi = await opsiServer();

  const teks = kirimServer(opsi, { request: { query_string: "page=2&ticket=SRV-9" } });
  assert.equal(teks.request?.query_string, "page=2&ticket=[disensor]");

  const pasangan = kirimServer(opsi, {
    request: { query_string: [["page", "2"], ["ticket", "SRV-9"]] },
  });
  assert.deepEqual(pasangan.request?.query_string, [
    ["page", "2"],
    ["ticket", "[disensor]"],
  ]);

  const objek = kirimServer(opsi, {
    request: { query_string: { page: "2", ticket: "SRV-9" } },
  });
  assert.deepEqual(objek.request?.query_string, { page: "2", ticket: "[disensor]" });
});

// --- Server: kredensial dan body ---------------------------------------------

test("body, cookie, dan header kredensial tetap dibuang", async () => {
  const event = kirimServer(await opsiServer(), eventLacak());
  const request = event.request as Record<string, unknown>;

  assert.equal("data" in request, false, "body request tidak boleh ikut terkirim");
  assert.equal("cookies" in request, false, "cookie tidak boleh ikut terkirim");
  const serial = JSON.stringify(event);
  assert.equal(serial.includes("Siti Rahayu"), false);
  assert.equal(serial.includes("356938035643809"), false);

  const headers = request.headers as Record<string, string>;
  for (const kunci of ["authorization", "cookie", "x-api-key"]) {
    assert.equal(kunci in headers, false, `header ${kunci} tidak boleh dikirim`);
  }
  // Header yang berguna untuk diagnosa harus tetap ada, supaya test ini
  // membuktikan penyaringan berjalan dan bukan sekadar menghapus semuanya.
  assert.equal(headers["user-agent"], "Mozilla/5.0");
});

test("event tanpa request tidak dibelokkan", async () => {
  const event = kirimServer(await opsiServer(), { exception: { values: [] } });
  assert.deepEqual(event, { exception: { values: [] } });
});

// --- Server: batas pengumpulan data ------------------------------------------

test("SDK tidak mengumpulkan IP dan query string sejak sumbernya", async () => {
  // Default SDK v11 untuk keduanya true, jadi tanpa baris ini SDK menempelkan
  // IP pengunjung ke event dan menyisakan query string mentah di
  // request.url, request.query_string, atribut span, dan breadcrumb request
  // keluar (fetch ke PostgREST memakai ?username=eq.<nilai> di
  // src/lib/actions/auth.ts).
  assert.deepEqual((await opsiServer()).dataCollection, {
    userInfo: false,
    urlQueryParams: false,
  });
});

// --- Client: replay -----------------------------------------------------------

test("replay dimatikan total di browser, termasuk saat ada galat", async () => {
  const opsi = await opsiClient();

  // Perekam replay berjalan di browser dan tidak pernah melewati beforeSend
  // server, jadi selama rates-nya bukan 0, isi DOM portal ikut terkirim.
  assert.equal(opsi.replaysOnErrorSampleRate, 0);
  assert.equal(opsi.replaysSessionSampleRate, 0);
});

test("pelaporan galat tidak bergantung pada replay", async () => {
  // captureException di error boundary tetap jalan; yang hilang hanya rekaman
  // layar, bukan event-nya, dan tracing tetap dimatikan.
  const opsi = await opsiClient();
  assert.equal(typeof opsi.beforeSend, "function");
  assert.equal(opsi.tracesSampleRate, 0);
});

// --- Client: breadcrumb -------------------------------------------------------

test("breadcrumb browser tidak membawa query string", async () => {
  const sebelumBreadcrumb = ambilBeforeBreadcrumb(await opsiClient());

  // Kategori HARUS yang benar-benar dihasilkan @sentry/browser v11. Nilai
  // "http" itu TYPE, bukan category, jadi seperti ini tidak
  // pernah dibuat SDK dan test yang memakainya akan hijau tanpa pernah
  // menguji filter. Kategori aslinya adalah "fetch" dan "xhr"; keduanya
  // diuji di sini supaya regresi ke kategori yang salah langsung terlihat.
  for (const kategori of ["fetch", "xhr"]) {
    const breadcrumb = sebelumBreadcrumb({
      category: kategori,
      type: "http",
      data: { url: "https://atcell.my.id/id/tracking?ticket=SRV-2026-0042", status_code: 404 },
    });
    assert.equal(
      breadcrumb.data?.url,
      "https://atcell.my.id/id/tracking",
      `kategori ${kategori} harus kehilangan query string`
    );
    assert.equal(
      breadcrumb.data?.status_code,
      404,
      `kategori ${kategori}: status tetap perlu untuk diagnosa`
    );
  }

  // Navigasi juga wajib dicoret. Halaman lacak dipanggil lewat router.push,
  // yang menghasilkan breadcrumb navigation dengan search string di data.to.
  // Tanpa penyaringan ini, kode tiket bocor lewat history listener.
  const navigasi = sebelumBreadcrumb({
    category: "navigation",
    data: {
      from: "https://atcell.my.id/id",
      to: "https://atcell.my.id/id/tracking?ticket=SRV-2026-0042",
    },
  });
  assert.equal(navigasi.data?.to, "https://atcell.my.id/id/tracking");
  assert.equal(navigasi.data?.from, "https://atcell.my.id/id", "from ikut dipangkas");

  // Breadcrumb tanpa URL harus lewat apa adanya.
  const lain = sebelumBreadcrumb({ category: "ui.click", data: { selector: "button" } });
  assert.equal(lain.data?.selector, "button");
});

// --- Client: beforeSend bukan tempat penyaringan ------------------------------

test("beforeSend client meneruskan event tanpa menyaring apa pun", async (t) => {
  // @types/node seri 20 menandai NODE_ENV readonly, jadi ditulis lewat
  // ProcessEnv yang dilonggarkan; nilainya dipulihkan setelah test.
  const env = process.env as Record<string, string | undefined>;
  const asli = env.NODE_ENV;
  env.NODE_ENV = "production";
  t.after(() => {
    if (asli === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = asli;
  });

  const beforeSend = ambilBeforeSend(await opsiClient());

  // Dikembalikan sebagai objek yang sama, bukan salinan: kalau client nanti
  // mulai menyaring, test ini gagal. Penyaringan data pelanggan tetap satu
  // rumah di beforeSend server.
  const event = eventLacak();
  const hasil = beforeSend(event);
  assert.equal(hasil, event);
  assert.equal(hasil!.request?.query_string, "ticket=SRV-2026-0042");
});
