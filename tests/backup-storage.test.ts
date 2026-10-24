import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";

/*
 * backup-storage.sh harus betul-betul bisa dipulihkan, bukan cuma "keluar 0".
 *
 * Test di sini memainkan script sungguhan di depan server HTTP tiruan yang
 * meniru Storage API Supabase (list per prefix + unduh per objek + kirim
 * off-site lewat PUT), lalu memeriksa hasilnya hingga level tar terdekripsi
 * dan manifest.json. Fail-closed juga dites satu per satu: kredensial hilang,
 * metadata rusak, storage kosong, ukuran tidak cocok, unduh gagal, listing
 * gagal, nama objek mencurigakan, dan tidak ada tujuan off-site. Kredensial
 * tidak boleh pernah muncul di argv curl: tangkapan argv patuh pada pola yang
 * sama dengan test watchdog.
 */

const scriptPath = new URL("../scripts/backup-storage.sh", import.meta.url).pathname;

const BUKET_TEST = "service-photos,trade-in-photos";
const PASSPHRASE = "frasa-ujian-atcell-2026";
const API_KEY = "kunci-servis-palsu-jangan-pernah-argv";
const TOKEN_PUT = "token-kirim-palsu";
// Password-nya "rahasia" karena itu ada di allowlist password dummy milik
// tests/no-secret-in-repo.test.ts. Nilai yang tidak ada di allowlist akan
// dianggap kredensial sungguhan dan menggagalkan guard repo.
const DSN_DUMMY = "postgresql://uji:rahasia@127.0.0.1:5432/uji";

/* Isi byte objek yang deterministik agar sha antara server tiruan dan test
 * selalu sama. */
function isiObjek(bucket: string, nama: string): Buffer {
  const teks = `${bucket}/${nama}`;
  return Buffer.from(teks.repeat(Math.ceil(64 / teks.length)).slice(0, 64), "utf8");
}

function checksum(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

const SQL_MANA = "-- dump tiruan untuk test\nc=\nCREATE TABLE storage.buckets (id text);\nc=\nCREATE TABLE storage.objects (id text);\n";

type ModeServer =
  | "normal"
  | "list-500"
  | "list-busuk"
  | "get-404"
  | "ukuran-salah"
  | "traversal"
  | "langganan-kosong";

type HasilKirim = { jalur: string; isi: Buffer; auth: string | undefined };

type ServerTiruan = {
  alamat: string;
  tutup: () => Promise<void>;
  tutupSemuaKoneksi?: () => void;
  kirim: () => HasilKirim[];
};

const serverAktif = new Set<ServerTiruan>();

// Tutup semua server tiruan yang masih hidup setelah berkas test selesai.
// Tanpa ini, assertion gagal sebelum `tutup()` membuat proses test menggantung.
after(async () => {
  for (const s of serverAktif) {
    s.tutupSemuaKoneksi?.();
    await s.tutup();
  }
});

function mulaiServerTiruan(mode: ModeServer): Promise<ServerTiruan> {
  return new Promise((resolve) => {
    const kirim: HasilKirim[] = [];
    const server: Server = createServer((req, res) => {
      const url = req.url ?? "";
      if (req.method === "POST" && url.startsWith("/storage/v1/object/list/")) {
        let badan = "";
        req.on("data", (pot: unknown) => { badan += String(pot); });
        req.on("end", () => {
          if (mode === "list-500") {
            res.writeHead(500).end();
            return;
          }
          if (mode === "list-busuk") {
            res.writeHead(200, { "Content-Type": "application/json" }).end("<bukan-json>");
            return;
          }
          const tumpuk = JSON.parse(badan) as { prefix: string; limit: number; offset: number };
          if (mode === "langganan-kosong") {
            res.writeHead(200, { "Content-Type": "application/json" }).end("[]");
            return;
          }
          if (mode === "traversal") {
            res.writeHead(200, { "Content-Type": "application/json" }).end(
              JSON.stringify([{ name: "../escape" }])
            );
            return;
          }
          const { prefix, limit, offset } = tumpuk;
          const bucket = decodeURIComponent(url.slice("/storage/v1/object/list/".length));
          let entri: Array<{ name: string; metadata?: { size: number; mimetype: string } }> = [];
          if (bucket === "service-photos" && prefix === "") {
            entri = [{ name: "foto" }];
          } else if (bucket === "service-photos" && prefix === "foto/") {
            entri = Array.from({ length: 105 }, (_, i) => {
              const nama = `f${String(i + 1).padStart(3, "0")}.jpg`;
              const ukuran = mode === "ukuran-salah" && i === 0 ? 9999 : isiObjek(bucket, nama).length;
              return { name: nama, metadata: { size: ukuran, mimetype: "image/jpeg" } };
            });
          } else if (bucket === "trade-in-photos" && prefix === "") {
            entri = [
              { name: "nota.pdf", metadata: { size: isiObjek(bucket, "nota.pdf").length, mimetype: "application/pdf" } },
            ];
          }
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify(entri.slice(offset, offset + limit))
          );
        });
        return;
      }
      if (req.method === "GET" && url.startsWith("/storage/v1/object/")) {
        const geo = url.slice("/storage/v1/object/".length);
        const indeksSlash = geo.indexOf("/");
        const bucket = decodeURIComponent(geo.slice(0, indeksSlash));
        const jalur = geo.slice(indeksSlash + 1).split("/").map((p) => decodeURIComponent(p)).join("/");
        if (mode === "get-404" && bucket === "service-photos" && jalur.startsWith("foto/f001")) {
          res.writeHead(404).end();
          return;
        }
        if (mode === "get-404" && bucket === "trade-in-photos") {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200).end(isiObjek(bucket, jalur));
        return;
      }
      if (req.method === "PUT" && url.startsWith("/offsite/")) {
        if (req.headers.authorization !== `Bearer ${TOKEN_PUT}`) {
          res.writeHead(401).end();
          return;
        }
        const potongan: Buffer[] = [];
        req.on("data", (p: Buffer) => { potongan.push(p); });
        req.on("end", () => {
          kirim.push({ jalur: url, isi: Buffer.concat(potongan), auth: req.headers.authorization });
          res.writeHead(200).end();
        });
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      const hasil: ServerTiruan = {
        alamat: `http://127.0.0.1:${port}`,
        tutup: () => new Promise<void>((selesai) => { server.close(() => selesai()); }),
        tutupSemuaKoneksi: () => { server.closeAllConnections(); },
        kirim: () => kirim,
      };
      serverAktif.add(hasil);
      resolve(hasil);
    });
  });
}

type Lingkungan = {
  akar: string;
  backupDir: string;
  env: NodeJS.ProcessEnv;
  metaPath: string;
};

type OpsiLingkungan = {
  server: ServerTiruan;
  pakaiDocker?: boolean;
  metadata?: string;
  PATH?: string;
  hapus?: Array<string>;
  BUCKETS?: string;
};

function buatLingkungan(opsi: OpsiLingkungan): Lingkungan {
  const akar = mkdtempSync(join(tmpdir(), "storage-backup-"));
  const backupDir = join(akar, "backup");
  const bin = join(akar, "bin");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(bin, { recursive: true });

  const metaPath = join(akar, "metadata.sql");
  if (opsi.pakaiDocker) {
    const logDocker = join(akar, "docker.log");
    const dockerStub = [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> ${JSON.stringify(logDocker)}`,
      "dst=",
      "src=",
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    *dst=/out/metadata.sql*) src="${arg#*src=}"; src="${src%%,dst=*}" ;;',
      "  esac",
      "done",
      `printf '%s\\n' ${JSON.stringify(SQL_MANA)} > "$src"`,
      "[ -s \"$src\" ] || exit 1",
      "exit 0",
    ].join("\n");
    writeFileSync(join(bin, "docker"), dockerStub);
    chmodSync(join(bin, "docker"), 0o700);
  }

  const rcloneStub = [
    "#!/bin/sh",
    `printf '%s\\n' "$@" >> ${JSON.stringify(join(akar, "rclone.log"))}`,
    "exit 0",
  ].join("\n");
  writeFileSync(join(bin, "rclone"), rcloneStub);
  chmodSync(join(bin, "rclone"), 0o700);

  const metadataTulis = opsi.metadata ?? SQL_MANA;
  writeFileSync(metaPath, metadataTulis);

  const curlNyata = spawnSync("sh", ["-c", "command -v curl || which curl"], { encoding: "utf8" }).stdout.trim();
  if (opsi.PATH) {
    const curlStub = [
      "#!/bin/sh",
      `printf '%s\\n' "$@" >> ${JSON.stringify(join(akar, "curl-argv.log"))}`,
      `exec ${curlNyata} "$@"`,
    ].join("\n");
    writeFileSync(join(bin, "curl"), curlStub);
    chmodSync(join(bin, "curl"), 0o700);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_DIR: backupDir,
    STORAGE_SUPABASE_URL: opsi.server.alamat,
    BUCKETS: opsi.BUCKETS ?? BUKET_TEST,
    STORAGE_PASSPHRASE: PASSPHRASE,
    STORAGE_OFFSITE_PUT_URL: `${opsi.server.alamat}/offsite`,
    STORAGE_OFFSITE_PUT_TOKEN: TOKEN_PUT,
    STORAGE_API_KEY: API_KEY,
    STORAGE_METADATA_DUMP_FILE: metaPath,
  };
  for (const k of opsi.hapus ?? []) delete env[k];
  if (opsi.PATH) env.PATH = `${bin}:${process.env.PATH}`;
  else env.PATH = `${bin}:${process.env.PATH}`;

  return {
    akar,
    backupDir,
    env,
    metaPath,
  };
}

// spawn, bukan spawnSync: saat script berjalan, event loop node tetap hidup
// supaya server tiruan di proses yang sama bisa menjawab curl yang masuk.
function jalankan(env: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn("/bin/bash", [scriptPath], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d: Buffer) => { stdout += d; });
    p.stderr.on("data", (d: Buffer) => { stderr += d; });
    p.on("close", (status: number | null) => resolve({ status, stdout, stderr }));
  });
}

function dekripsiKe(fileEnc: string, sasaran: string): void {
  const hasil = spawnSync("openssl", ["enc", "-aes-256-cbc", "-d", "-pbkdf2", "-iter", "100000", "-in", fileEnc, "-pass", `pass:${PASSPHRASE}`, "-out", sasaran]);
  assert.equal(hasil.status, 0, `dekripsi gagal: ${hasil.stderr?.toString()}`);
}

test("gladi sukses: tar terdekripsi, manifest, checksum, dan PUT off-site cocok", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);

  assert.equal(hasil.status, 0, `seharusnya sukses\n=== stdout ===\n${hasil.stdout}\n=== stderr ===\n${hasil.stderr}`);

  const isi = readdirSync(lingkungan.backupDir).sort();
  const namaEnc = isi.find((f) => f.endsWith(".tar.enc"));
  assert.ok(namaEnc, `arsip .enc tidak ditemukan: ${isi.join(", ")}`);
  assert.match(namaEnc ?? "", /^atcell-storage-\d{8}T\d{6}Z\.tar\.enc$/);

  const adaChecksum = isi.find((f) => f === `${namaEnc}.sha256`);
  assert.ok(adaChecksum, "checksum salinan tidak ada");
  const checksumTercatat = readFileSync(join(lingkungan.backupDir, `${namaEnc}.sha256`), "utf8").trim().split(" ")[0];
  assert.equal(checksumTercatat, checksum(readFileSync(join(lingkungan.backupDir, namaEnc ?? ""))));

  // Staging harus bersih: hanya .enc dan .sha256 yang tersisa di BACKUP_DIR.
  assert.equal(isi.length, 2, `sisa berkas di BACKUP_DIR: ${isi.join(", ")}`);

  const sasaran = join(lingkungan.akar, "tar.tar");
  dekripsiKe(join(lingkungan.backupDir, namaEnc ?? ""), sasaran);
  const tarList = spawnSync("tar", ["-tf", sasaran], { encoding: "utf8" }).stdout;
  assert.match(tarList, /(^|\/)metadata\.sql$/m);
  assert.match(tarList, /(^|\/)manifest\.json$/m);
  assert.match(tarList, /service-photos\/foto\/f001\.jpg/m);
  assert.match(tarList, /trade-in-photos\/nota\.pdf/m);

  const ekstrak = join(lingkungan.akar, "ekstrak");
  mkdirSync(ekstrak, { recursive: true });
  spawnSync("tar", ["-xf", sasaran, "-C", ekstrak]);
  const manifest = JSON.parse(readFileSync(join(ekstrak, "manifest.json"), "utf8")) as {
    created: string; source_host: string; buckets: string[];
    files: Array<{ bucket: string; path: string; sha256: string; size: number; mimetype: string }>;
  };
  assert.equal(manifest.buckets.join(","), BUKET_TEST);
  assert.equal(manifest.files.length, 106);

  for (const file of manifest.files) {
    const byteObjek = readFileSync(join(ekstrak, file.bucket, file.path));
    assert.equal(file.sha256, checksum(byteObjek), `sha beda untuk ${file.bucket}/${file.path}`);
    assert.equal(file.size, byteObjek.length, `ukuran beda untuk ${file.bucket}/${file.path}`);
  }
  assert.equal(manifest.files[0].mimetype, "image/jpeg");

  const kirim = server.kirim();
  assert.equal(kirim.length, 2, "PUT off-site harus .enc dan .sha256 saja");
  assert.deepEqual(
    kirim.map((k) => k.jalur).sort(),
    ["/offsite/" + namaEnc, "/offsite/" + namaEnc + ".sha256"].sort()
  );
  const isiEnc = readFileSync(join(lingkungan.backupDir, namaEnc ?? ""));
  assert.equal(kirim.find((k) => k.jalur.endsWith(".enc"))?.isi.equals(isiEnc), true);
  for (const k of kirim) {
    assert.equal(k.auth, `Bearer ${TOKEN_PUT}`, "auth header PUT off-site tidak sesuai token");
  }

  await server.tutup();
});

test("metadata via docker: DSN tidak pernah masuk argumen proses", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, pakaiDocker: true, hapus: ["STORAGE_METADATA_DUMP_FILE"] });
  lingkungan.env.SOURCE_DATABASE_URL = DSN_DUMMY;

  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 0, `seharusnya sukses\n=== stderr ===\n${hasil.stderr}`);

  const logDocker = readFileSync(join(lingkungan.akar, "docker.log"), "utf8");
  assert.match(logDocker, /(^|\s)-e SOURCE_DATABASE_URL(\s|$)/, "DSN harus lewat env, bukan argv");
  assert.match(logDocker, /postgres:17-alpine/);
  assert.match(logDocker, /pg_dump.*--schema=storage/, "pg_dump harus --schema=storage");
  assert.ok(!logDocker.includes(DSN_DUMMY), "DSN bocor ke argv docker");

  await server.tutup();
});

test("token/API key tidak pernah muncul di argv curl", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, PATH: "ya" });

  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 0, `seharusnya sukses\n=== stderr ===\n${hasil.stderr}`);

  const argv = readFileSync(join(lingkungan.akar, "curl-argv.log"), "utf8");
  assert.ok(!argv.includes(API_KEY), `API key bocor ke argv curl:\n${argv}`);
  assert.ok(!argv.includes(TOKEN_PUT), `token kirim bocor ke argv curl:\n${argv}`);

  await server.tutup();
});

test("jalur rclone: salinan .enc dan .sha256 ke peranti ditunjukkan", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({
    server,
    hapus: ["STORAGE_OFFSITE_PUT_URL", "STORAGE_OFFSITE_PUT_TOKEN"],
  });
  lingkungan.env.STORAGE_OFFSITE_RCLONE_REMOTE = "b6-ujian:atcell";

  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 0, `seharusnya sukses\n=== stderr ===\n${hasil.stderr}`);

  const log = readFileSync(join(lingkungan.akar, "rclone.log"), "utf8");
  assert.match(log, /copyto/);
  assert.match(log, /atcell-storage-\d{8}T\d{6}Z\.tar\.enc$/m);
  assert.match(log, /atcell-storage-\d{8}T\d{6}Z\.tar\.enc\.sha256$/m);

  await server.tutup();
});

test("fail-closed: tanpa passphrase tidak ada jalan keluar 0", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, hapus: ["STORAGE_PASSPHRASE"] });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 1);
  assert.match(hasil.stderr, /STORAGE_PASSPHRASE/);
  await server.tutup();
});

test("fail-closed: tanpa API key tidak ada jalan keluar 0", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, hapus: ["STORAGE_API_KEY"] });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 1);
  assert.match(hasil.stderr, /tidak ada key/);
  await server.tutup();
});

test("fail-closed: metadata tanpa storage.buckets/objects ditolak (exit 72)", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, metadata: "-- dump: tak ada table storage. kosong" });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 72);
  assert.match(hasil.stderr, /storage\.buckets/);
  await server.tutup();
});

test("fail-closed: tanpa tujuan off-site, arsip tetap lokal (exit 1)", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({
    server,
    hapus: ["STORAGE_OFFSITE_PUT_URL", "STORAGE_OFFSITE_PUT_TOKEN"],
  });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 1);
  assert.match(hasil.stderr, /tidak ada tujuan off-site/);
  await server.tutup();
});

test("fail-closed: dunia langganan kosong → dapat exit 73", async () => {
  const server = await mulaiServerTiruan("langganan-kosong");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 73);
  assert.match(hasil.stderr, /tidak ada satu pun objek/);
  assert.match(hasil.stderr, /service-photos trade-in-photos/);
  await server.tutup();
});

test("fail-closed: PUT gagal (token salah) → exit 1, pesan PUT", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server });
  lingkungan.env.STORAGE_OFFSITE_PUT_TOKEN = "token-salah-sendiri";
  // Intersep: server tiruan menolak token salah dengan 401.
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 1);
  assert.match(hasil.stderr, /PUT .+ gagal\.?$/m);
  await server.tutup();
});

test("fail-closed: ukuran tidak cocok → exit 71", async () => {
  const server = await mulaiServerTiruan("ukuran-salah");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 71);
  assert.match(hasil.stderr, /ukuran tidak cocok/);
  assert.equal(existsSync(lingkungan.backupDir), true);
  await server.tutup();
});

test("fail-closed: GET 404 → exit 76", async () => {
  const server = await mulaiServerTiruan("get-404");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 76);
  assert.match(hasil.stderr, /download.*gagal/);
  await server.tutup();
});

test("fail-closed: listing 500 → exit 76", async () => {
  const server = await mulaiServerTiruan("list-500");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 76);
  assert.match(hasil.stderr, /listing.*gagal/);
  await server.tutup();
});

test("fail-closed: nama objek traversal ditolak → exit 74", async () => {
  const server = await mulaiServerTiruan("traversal");
  const lingkungan = buatLingkungan({ server });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 74);
  assert.match(hasil.stderr, /mencurigakan/);
  await server.tutup();
});

test("fail-closed: nama bucket liar ditolak → exit 77", async () => {
  const server = await mulaiServerTiruan("normal");
  const lingkungan = buatLingkungan({ server, BUCKETS: "baik,bad;name" });
  const hasil = await jalankan(lingkungan.env);
  assert.equal(hasil.status, 77);
  assert.match(hasil.stderr, /tidak diperizinkan/);
  await server.tutup();
});
