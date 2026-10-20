import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

/*
 * Gerbang tulis untuk deployment pratinjau.
 *
 * Keadaan yang membuat ini perlu: deployment pratinjau di Vercel memakai
 * environment yang sama dengan production, termasuk DATABASE_URL dan
 * service role key. Tanpa penanda, Server Action mutasi di pratinjau
 * akan dengan senang hati mengubah data toko yang sebenarnya. Verified
 * pada 20 Oktober 2026: pratinjau PR #128 menyajikan katalog yang identik
 * dengan atcell.my.id dan melaporkan serviceRoleConfigured: true.
 *
 * Tiga lapis yang diuji file ini:
 *
 *   1. Matriks jenis deployment dan hak tulis. Env yang dibaca platform
 *      (VERCEL_ENV, COOLIFY_BRANCH) harus memetakan ke keputusan yang
 *      benar, dan koreksi manual ATCELL_ALLOW_WRITE harus tetap berlaku.
 *   2. Setiap Server Action yang menulis harus memanggil gerbang. Ini
 *      dipindai dari source, karena tidak ada cara menguji "aksinya
 *      ditolak" tanpa database dan tanpa menjalankan seluruh portal.
 *   3. Satu aksi nyata harus benar-benar menolak saat pratinjau.
 *
 * Lapis 2 yang paling penting. Lapis 1 bisa hijau sementara ada aksi
 * mutasi baru yang lupa memanggil gerbang, dan itu persis kelas cacat
 * yang sudah beberapa kali muncul di repo ini: penjaga yang Diam-diam
 * tidak bisa gagal.
 */

const repoRoot = new URL("../", import.meta.url);

/** Jalankan fn dengan env yangditimpa, lalu kembalikan env seperti semula. */
function denganEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const lama: Record<string, string | undefined> = {};
  for (const kunci of Object.keys(env)) lama[kunci] = process.env[kunci];
  try {
    for (const [kunci, nilai] of Object.entries(env)) {
      if (nilai === undefined) delete process.env[kunci];
      else process.env[kunci] = nilai;
    }
    return fn();
  } finally {
    for (const [kunci, nilai] of Object.entries(lama)) {
      if (nilai === undefined) delete process.env[kunci];
      else process.env[kunci] = nilai;
    }
  }
}

const deployment = await import("../src/lib/deployment.ts");

test("deployment pratinjau Vercel tidak boleh menulis", () => {
  denganEnv({ VERCEL_ENV: "preview", COOLIFY_BRANCH: undefined }, () => {
    assert.equal(deployment.getDeploymentKind(), "preview");
    const akses = deployment.checkWriteAccess();
    assert.equal(akses.allowed, false, "pratinjau Vercel harus ditolak");
  });
});

test("deployment production Coolify boleh menulis", () => {
  denganEnv({ VERCEL_ENV: undefined, COOLIFY_BRANCH: "main" }, () => {
    assert.equal(deployment.getDeploymentKind(), "production");
    assert.equal(deployment.checkWriteAccess().allowed, true);
  });
});

test("branch Coolify selain main diperlakukan sebagai pratinjau", () => {
  denganEnv({ VERCEL_ENV: undefined, COOLIFY_BRANCH: "feature/percobaan" }, () => {
    assert.equal(deployment.getDeploymentKind(), "preview");
    assert.equal(deployment.checkWriteAccess().allowed, false);
  });
});

test("deployment production Vercel boleh menulis", () => {
  denganEnv({ VERCEL_ENV: "production", COOLIFY_BRANCH: undefined }, () => {
    assert.equal(deployment.getDeploymentKind(), "production");
    assert.equal(deployment.checkWriteAccess().allowed, true);
  });
});

test("lingkungan lokal tanpa penanda platform tetap boleh menulis", () => {
  // Developer lokal sering memakai Supabase sungguhan untuk menguji alur
  // staf. Menolak semua env tanpa penanda akanQuietly mematikan alur itu.
  denganEnv({ VERCEL_ENV: undefined, COOLIFY_BRANCH: undefined }, () => {
    assert.equal(deployment.getDeploymentKind(), "unknown");
    assert.equal(deployment.checkWriteAccess().allowed, true);
  });
});

test("ATCELL_ALLOW_WRITE=YES mengizinkan pratinjau menulis secara sadar", () => {
  // Jalur koreksi: kalau pratinjau punya database sendiri, owner boleh
  // mengizinkan menulis lewat env ini, dan keputusannya harus menghormati
  // itu, bukan menimpanya.
  denganEnv(
    { VERCEL_ENV: "preview", COOLIFY_BRANCH: undefined, ATCELL_ALLOW_WRITE: "YES" },
    () => {
      assert.equal(deployment.getDeploymentKind(), "preview");
      assert.equal(deployment.checkWriteAccess().allowed, true);
    }
  );
});

test("ATCELL_ALLOW_WRITE hanya berlaku kalau persis YES", () => {
  for (const nilai of ["yes", "true", "1", "YA", ""]) {
    denganEnv(
      { VERCEL_ENV: "preview", COOLIFY_BRANCH: undefined, ATCELL_ALLOW_WRITE: nilai },
      () => {
        assert.equal(
          deployment.checkWriteAccess().allowed,
          false,
          `nilai "${nilai}" tidak boleh mengizinkan menulis`
        );
      }
    );
  }
});

test("alasan penolakan menyebut pratinjau dan tidak membocorkan nilai rahasia", () => {
  denganEnv({ VERCEL_ENV: "preview", COOLIFY_BRANCH: undefined }, () => {
    const akses = deployment.checkWriteAccess();
    assert.equal(akses.allowed, false);
    if (akses.allowed) return;
    assert.match(akses.reason, /pratinjau/i);
    assert.doesNotMatch(akses.reason, /supabase|postgres|:\/\//i);
  });
});

/* ------------------------------------------------------------------ *
 * Lapis 2: setiap aksi mutasi wajib memanggil gerbang.
 * ------------------------------------------------------------------ */

const actionsDir = new URL("src/lib/actions/", repoRoot);

/** Token yang menandai sebuah Server Action mengubah data. */
const TOKEN_MUTASI = [
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
  ".signUp(",
  ".upload(",
];

/** Token yang menandai pemanggilan gerbang tulis. */
const TOKEN_GERBANG = "requireWriteAccess";

type ModulAction = { nama: string; isi: string };

async function modulAction(): Promise<ModulAction[]> {
  const keluar: ModulAction[] = [];
  for (const nama of await readdir(actionsDir)) {
    if (!nama.endsWith(".ts")) continue;
    const isi = await readFile(new URL(nama, actionsDir), "utf8");
    // Hanya modul action sungguhan. Berkas lain di folder yang sama hanya
    // menyebut "use server" di dalam komentar pembuka, jadi arahkan ke
    // baris pertama file, bukan ke seluruh isi.
    const barisPertama = isi.split("\n")[0]?.trim();
    if (barisPertama !== '"use server";') continue;
    keluar.push({ nama, isi });
  }
  return keluar;
}

/**
 * Nama fungsi Server Action yang precedes setiap token mutasi.
 *
 * Pemotongan pakai batas "export async function" berikutnya, bukan pencocokan
 * kurung kurawal, supaya kawatir kurawal di dalam string tidak membuat
 * pembacaan sumber meleset.
 */
function aksiMutasi(isi: string): string[] {
  // Indentasi ditoleransi supaya baris fungsi yang tidak persis di kolom nol
  // tidak lolos dari pemindaian.
  const batas = [...isi.matchAll(/^\s*export async function ([A-Za-z0-9_]+)/gm)];
  const hasil: string[] = [];
  for (let i = 0; i < batas.length; i++) {
    const mulai = batas[i].index ?? 0;
    const selesai = i + 1 < batas.length ? (batas[i + 1].index ?? isi.length) : isi.length;
    const badan = isi.slice(mulai, selesai);
    if (TOKEN_MUTASI.some((token) => badan.includes(token))) hasil.push(batas[i][1]);
  }
  return hasil;
}

test("semua aksi mutasi memanggil gerbang tulis", async () => {
  const modul = await modulAction();
  assert.ok(modul.length >= 8, `hanya ${modul.length} modul action ditemukan`);

  const tanpaGerbang: string[] = [];
  for (const { nama, isi } of modul) {
    for (const aksi of aksiMutasi(isi)) {
      const mulai = isi.indexOf(`export async function ${aksi}`);      const berikutnya = isi.indexOf("\nexport async function", mulai + 1);
      const badan = isi.slice(mulai, berikutnya === -1 ? undefined : berikutnya);
      if (!badan.includes(TOKEN_GERBANG)) tanpaGerbang.push(`${nama}:${aksi}`);
    }
  }

  assert.deepEqual(
    tanpaGerbang.sort(),
    [],
    `aksi mutasi ini mengubah data tanpa memanggil gerbang tulis, jadi akan\n` +
      `berubah di deployment pratinjau yang memakai database production:\n` +
      tanpaGerbang.map((x) => `  ${x}`).join("\n")
  );
});

test("penjaga gerbang benar-benar bisa menangkap aksi mutasi tanpa gerbang", async () => {
  // Uji negatif untuk predikat di atas. Kalau penyaring mutasi berhenti
  // bekerja, test sebelumnya akan hijau tanpa memeriksa apa pun.
  const contoh = `
    "use server";
    export async function aksiBaca() { const x = db.select().from(t); return x; }
    export async function aksiTulis() { await db.insert(t).values({}); }
  `;
  assert.deepEqual(aksiMutasi(contoh), ["aksiTulis"]);
  assert.deepEqual(aksiMutasi('"use server";\nexport async function a() { return 1; }'), []);
});

/* ------------------------------------------------------------------ *
 * Lapis 3: aksi nyata menolak saat pratinjau.
 * ------------------------------------------------------------------ */

const srcRoot = fileURLToPath(new URL("src/", repoRoot));
const SERVER_CLIENT_STUB =
  "data:text/javascript,export async function createClient(){throw new Error('stub: test ini tidak memakai sesi Supabase');}";
// next/cache hanya bisa diimpor di dalam runtime Next. Stub-nya cukup untuk
// membuat modul action bisa dimuat, karena aksi yang diuji ditolak sebelum
// revalidatePath() pernah dipanggil.
const CACHE_STUB =
  "data:text/javascript,export function revalidatePath(){}";
// next/headers juga hanya hidup di runtime Next. Yang dibutuhkan test ini
// cuma fungsi headers() yang mengembalikan objek kosong, karena aksi yang
// diuji ditolak sebelum pembacaan header pernah jadi.
const HEADERS_STUB =
  "data:text/javascript,export async function headers(){return new Map();}export async function cookies(){return {get(){return undefined},set(){},delete(){}}}";

const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/supabase/server") {
      return { url: SERVER_CLIENT_STUB, format: "module", shortCircuit: true };
    }
    if (specifier === "next/cache") {
      return { url: CACHE_STUB, format: "module", shortCircuit: true };
    }
    if (specifier === "next/headers") {
      return { url: HEADERS_STUB, format: "module", shortCircuit: true };
    }
    if (!specifier.startsWith("@/") && !/^\.{1,2}\//.test(specifier)) return next(specifier, context);
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

const { updateStoreSettings } = await import("../src/lib/actions/settings.ts");

test("aksi mutasi nyata menolak saat deployment pratinjau", async () => {
  const hasil = await denganEnv({ VERCEL_ENV: "preview", COOLIFY_BRANCH: undefined }, () =>
    updateStoreSettings({} as never)
  );
  assert.equal(hasil.ok, false, "aksi harus ditolak di pratinjau");
  if (hasil.ok) return;
  assert.match(hasil.error, /pratinjau/i);
});

test("aksi mutasi nyata tetap jalan di deployment production", async () => {
  // Di production aksi boleh mencapai requireRole, yang tanpa sesi akan
  // menolak dengan pesan "belum login". Yang dibuktikan di sini bukan
  // kebetulan lewat, tapi bukan juga ditolak oleh gerbang tulis.
  const hasil = await denganEnv(
    { VERCEL_ENV: undefined, COOLIFY_BRANCH: "main" },
    async () => updateStoreSettings({} as never)
  );
  assert.equal(hasil.ok, false);
  if (hasil.ok) return;
  assert.doesNotMatch(hasil.error, /pratinjau/i, "gerbang tidak boleh menolak di production");
});
