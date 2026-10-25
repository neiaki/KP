import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

/*
 * Kunci terjemahan ID dan EN harus berbentuk pohon yang sama persis
 * (STANDAR At Cell bagian E). Kalau satu bahasa kehilangan kunci,
 * komponen yang memakai kunci itu merender undefined di salah satu
 * locale, dan itu tidak pernah kelihatan di tes yang cuma membuka satu
 * bahasa.
 *
 * Pembandingan dilakukan rekursif terhadap objek translations asli yang
 * diimpor dari source (bukan salinan), jadi menambah kunci di satu
 * bahasa saja langsung memerah. Bukti mutasi: hapus satu kunci EN
 * sementara -> tes gagal menyebut jalur kuncinya (transkrip, LOOP_LOG).
 */

const repoRoot = new URL("../", import.meta.url);
const srcRoot = new URL("src/", repoRoot);

// registerHooks sudah ada di Node 22, tetapi tipe @types/node yang terpasang
// belum mengenali signature sync-nya. Cast sempit ini menjaga tsc tetap
// strict tanpa mengubah perilaku hook.
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
    if (!specifier.startsWith("@/") && !/^\.{1,2}\//.test(specifier)) {
      return next(specifier, context);
    }
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(fileURLToPath(srcRoot), specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

const { translations } = await import("../src/lib/translations.ts");

function kunci(obj: unknown, jalur = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [jalur];
  return Object.entries(obj).flatMap(([k, v]) => kunci(v, jalur ? `${jalur}.${k}` : k));
}

function nilaiSamaBentuk(a: unknown, b: unknown): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return true;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    nilaiSamaBentuk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

test("pohon kunci ID dan EN identik", () => {
  const id = kunci(translations.id);
  const en = kunci(translations.en);
  assert.deepEqual(
    id,
    en,
    `pohon kunci berbeda; hilang/lebih di EN: ${JSON.stringify(
      id.filter((k) => !en.includes(k)).concat(en.filter((k) => !id.includes(k))).slice(0, 10)
    )}`
  );
});

test("tipe daun ID dan EN sejajar (string vs objek)", () => {
  assert.ok(
    nilaiSamaBentuk(translations.id, translations.en),
    "struktur bertipe beda antara ID dan EN"
  );
});

test("tidak ada nilai terjemahan kosong", () => {
  const kosong = kunci(translations.id)
    .map((jalur) => {
      const ambil = (o: unknown, j: string) =>
        j.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o);
      return { jalur, id: ambil(translations.id, jalur), en: ambil(translations.en, jalur) };
    })
    .filter(({ id, en }) => id === "" || en === "");
  assert.deepEqual(
    kosong.map((k) => k.jalur),
    [],
    "kunci dengan nilai string kosong (locale lain pasti tampil blank)"
  );
});
