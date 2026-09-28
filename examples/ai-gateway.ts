/*
 * Contoh pemakaian Vercel AI Gateway lewat AI SDK.
 *
 * Berjalan di luar Next.js, jadi tidak menyentuh route, layout, atau
 * Server Action mana pun. Jalankan dari root repo:
 *
 *   node --experimental-strip-types examples/ai-gateway.ts
 *
 * Kredensial dibaca dari AI_GATEWAY_API_KEY di .env.local. File itu
 * gitignored dan tidak boleh ikut ter-commit. Kalau variabelnya kosong,
 * skrip berhenti dengan pesan yang jelas sebelum membuat request, supaya
 * tidak terlihat seperti kegagalan jaringan.
 *
 * Model ditulis sebagai string "creator/model-name", bukan objek provider:
 * AI Gateway menormalisasi bentuk itu sendiri, dan yang membedakannya dari
 * model lokal adalah AI_GATEWAY_API_KEY yang terpasang di environment.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";

/**
 * Baca .env.local sendiri, bukan memakai dotenv.
 *
 * Repo ini tidak punya dotenv sebagai dependency, dan menambahkannya hanya
 * untuk satu file contoh tidak sepadan: pemanggilnya cukup satu kali saat
 * start, sebelum satu pun proses lain membaca environment.
 *
 * Path diukur dari root repo, bukan dari folder berkas ini, supaya skrip
 * dipanggil dari root repo maupun dari dalam folder examples/ mencari file
 * yang sama.
 */
const AKAR_REPO = new URL("../", import.meta.url);

function bacaEnvLokal(namaBerkas = ".env.local"): void {
  const path = fileURLToPath(new URL(namaBerkas, AKAR_REPO));
  let isi: string;
  try {
    isi = readFileSync(path, "utf8");
  } catch {
    // Tidak ada .env.local. Environment mungkin sudah menyetel key-nya, jadi
    // ini bukan kondisi gagal: biar pemanggil yang memutuskan.
    return;
  }

  for (const baris of isi.split("\n")) {
    const teks = baris.trim();
    // Lewati komentar dan baris kosong, supaya baris yang tidak boleh
    // di-parse tidak sampai jadi variabel.
    if (!teks || teks.startsWith("#")) continue;
    const pemisah = teks.indexOf("=");
    if (pemisah <= 0) continue;
    const kunci = teks.slice(0, pemisah).trim();
    let nilai = teks.slice(pemisah + 1).trim();
    // Buang tanda kutip bila ada, dan abaikan export di depan nilai.
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1);
    }
    if (!(kunci in process.env)) {
      process.env[kunci] = nilai;
    }
  }
}

bacaEnvLokal();

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error(
    "AI_GATEWAY_API_KEY belum diisi. Isi di .env.local pada root repo, lalu ulangi."
  );
  process.exit(1);
}

const { text } = await generateText({
  // Model yang diminta. Formatnya creator/model-name: AI Gateway yang
  // meneruskan ke provider, bukan SDK yang menebak provider dari nama.
  model: "openai/gpt-5.5",
  prompt: [
    "Buat satu hari libur baru yang belum pernah ada di dunia nyata.",
    "Sebutkan namanya, tanggal hari itu, dan jelaskan tradisi",
    "yang dilakukan: apa yang dimakan, apa yang dibawa, dan siapa saja yang",
    "mengikuti. Jawab dalam bahasa Indonesia, maksimal 180 kata, tanpa",
    "penanda markdown.",
  ].join(" "),
});

console.log(text);
