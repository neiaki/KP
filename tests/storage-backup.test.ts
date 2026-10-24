import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import type { AddressInfo } from "node:net";

const exec = promisify(execFile);
const backupScript = fileURLToPath(new URL("../scripts/backup-storage.sh", import.meta.url));
const restoreScript = fileURLToPath(new URL("../scripts/restore-storage.sh", import.meta.url));
const drillScript = fileURLToPath(new URL("../scripts/restore-storage-drill.sh", import.meta.url));

// Nilainya sengaja tidak berbentuk "sb_secret_..." supaya tidak dianggap
// kunci layanan sungguhan oleh tests/no-secret-in-repo.test.ts. Yang penting
// script memperlakukan ini sebagai kunci buram.
const KEY = "kunci-uji-storage-bukan-kredensial";
const PASS = "passphrase-uji-storage";
const TOKEN = "token-offsite-uji";
const BUCKETS = "product-images,service-photos,trade-in-photos";
// Password-nya "rahasia" karena itu ada di allowlist password dummy milik
// tests/no-secret-in-repo.test.ts. Nilai yang tidak ada di allowlist akan
// dianggap kredensial sungguhan dan menggagalkan guard repo.
const DSN = "postgresql://uji:rahasia@127.0.0.1:5432/uji";
const SQL_METADATA = [
  "CREATE TABLE storage.buckets (id text primary key, name text, public boolean);",
  "CREATE TABLE storage.objects (id uuid primary key, bucket_id text, name text);",
  "CREATE POLICY baca_katalog ON storage.objects FOR SELECT USING (true);",
  "",
].join("\n");

interface BucketConfig {
  id: string;
  name: string;
  public: boolean;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
  created_at: string;
  updated_at: string;
}

interface StoredObject {
  data: Buffer;
  contentType: string;
  cacheControl: string;
  createdAt: string;
  updatedAt: string;
}

interface ManifestFile {
  bucket: string;
  path: string;
  sha256: string;
  size: number | null;
  mimetype: string | null;
}

interface Manifest {
  created: string;
  source_host: string;
  buckets: string[];
  files: ManifestFile[];
}

interface StorageServer {
  url: string;
  targetUrl: string;
  buckets: Map<string, BucketConfig>;
  objects: Map<string, Map<string, StoredObject>>;
  uploads: string[];
  offsite: Map<string, Buffer>;
  requests: number;
  downloads: number;
  badAuth: number;
  offsiteBadAuth: number;
  totalObjects: () => number;
  close: () => Promise<void>;
}

function kirimJson(res: http.ServerResponse, status: number, body: unknown) {
  const isi = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(isi),
  });
  res.end(isi);
}

async function bacaBody(req: http.IncomingMessage): Promise<Buffer> {
  const potongan: Buffer[] = [];
  for await (const bagian of req) {
    potongan.push(Buffer.isBuffer(bagian) ? bagian : Buffer.from(bagian));
  }
  return Buffer.concat(potongan);
}

async function buatStorageServer(seed: boolean): Promise<StorageServer> {
  const buckets = new Map<string, BucketConfig>();
  const objects = new Map<string, Map<string, StoredObject>>();
  const uploads: string[] = [];
  const offsite = new Map<string, Buffer>();
  let requests = 0;
  let downloads = 0;
  let badAuth = 0;
  let offsiteBadAuth = 0;
  const waktu = "2026-01-01T00:00:00.000Z";

  const tambahBucket = (name: string, publik: boolean, batas: number | null, mime: string[] | null) => {
    buckets.set(name, {
      id: name,
      name,
      public: publik,
      file_size_limit: batas,
      allowed_mime_types: mime,
      created_at: waktu,
      updated_at: waktu,
    });
    objects.set(name, new Map());
  };

  const tambahObjek = (bucket: string, path: string, isi: string, mime = "image/jpeg") => {
    objects.get(bucket)?.set(path, {
      data: Buffer.from(isi),
      contentType: mime,
      cacheControl: "3600",
      createdAt: waktu,
      updatedAt: waktu,
    });
  };

  if (seed) {
    tambahBucket("product-images", true, 5_242_880, ["image/jpeg", "image/png", "image/webp"]);
    tambahBucket("service-photos", false, 10_485_760, null);
    tambahBucket("trade-in-photos", false, 10_485_760, null);

    for (let i = 0; i < 4; i += 1) {
      tambahObjek("product-images", `foto-${String(i).padStart(3, "0")}.jpg`, `foto-${i}`);
    }
    tambahObjek("product-images", "katalog/2026/satu.jpg", "katalog-satu");
    tambahObjek("product-images", "katalog/2026/dua.jpg", "katalog-dua", "image/png");
    tambahObjek("service-photos", "servis/SRV-20260101-ABCDEF12/awal.jpg", "servis-awal");
    tambahObjek("trade-in-photos", "tradein/TI-2026-001.jpg", "tradein-satu");
  }

  const server = http.createServer(async (req, res) => {
    try {
      requests += 1;
      if (!req.url) {
        kirimJson(res, 400, { message: "URL kosong" });
        return;
      }

      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/offsite/")) {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) {
          offsiteBadAuth += 1;
          kirimJson(res, 401, { message: "token offsite salah" });
          return;
        }
        if (req.method !== "PUT") {
          kirimJson(res, 405, { message: "offsite hanya PUT" });
          return;
        }
        const nama = decodeURIComponent(url.pathname.slice("/offsite/".length));
        offsite.set(nama, await bacaBody(req));
        kirimJson(res, 200, { ok: true });
        return;
      }

      if (req.headers.apikey !== KEY || req.headers.authorization !== `Bearer ${KEY}`) {
        badAuth += 1;
        kirimJson(res, 401, { message: "invalid auth" });
        return;
      }

      const segmen = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
      if (segmen[0] !== "storage" || segmen[1] !== "v1") {
        kirimJson(res, 404, { message: "route tidak dikenal" });
        return;
      }
      const route = segmen.slice(2);

      if (route[0] === "bucket") {
        if (route.length === 1 && req.method === "GET") {
          kirimJson(res, 200, [...buckets.values()]);
          return;
        }
        if (route.length === 1 && req.method === "POST") {
          const body = JSON.parse((await bacaBody(req)).toString()) as Partial<BucketConfig>;
          const name = body.name ?? body.id;
          if (!name) {
            kirimJson(res, 400, { message: "nama bucket kosong" });
            return;
          }
          if (buckets.has(name)) {
            kirimJson(res, 409, { message: "bucket sudah ada" });
            return;
          }
          buckets.set(name, {
            id: name,
            name,
            public: body.public ?? false,
            file_size_limit: body.file_size_limit ?? null,
            allowed_mime_types: body.allowed_mime_types ?? null,
            created_at: waktu,
            updated_at: waktu,
          });
          objects.set(name, new Map());
          kirimJson(res, 200, { name });
          return;
        }
        if (route.length === 2 && req.method === "PUT") {
          const bucket = buckets.get(route[1]);
          if (!bucket) {
            kirimJson(res, 404, { message: "bucket tidak ada" });
            return;
          }
          const body = JSON.parse((await bacaBody(req)).toString()) as Partial<BucketConfig>;
          if (typeof body.public === "boolean") bucket.public = body.public;
          if (body.file_size_limit !== undefined) bucket.file_size_limit = body.file_size_limit;
          if (body.allowed_mime_types !== undefined) bucket.allowed_mime_types = body.allowed_mime_types;
          bucket.updated_at = waktu;
          kirimJson(res, 200, { message: "bucket diperbarui" });
          return;
        }
        kirimJson(res, 405, { message: "metode bucket tidak didukung" });
        return;
      }

      if (route[0] === "object" && route[1] === "list" && req.method === "POST") {
        const bucket = route[2];
        const isiBucket = objects.get(bucket);
        if (!isiBucket) {
          kirimJson(res, 404, { message: "bucket tidak ada" });
          return;
        }
        const body = JSON.parse((await bacaBody(req)).toString()) as {
          prefix?: string;
          limit?: number;
          offset?: number;
        };
        const prefix = body.prefix ?? "";
        const limit = body.limit ?? 100;
        const offset = body.offset ?? 0;
        const folder = new Set<string>();
        const berkas: Array<{ name: string; metadata: Record<string, unknown> }> = [];

        for (const [path, obj] of isiBucket) {
          if (!path.startsWith(prefix)) continue;
          const sisa = path.slice(prefix.length);
          if (sisa.includes("/")) {
            folder.add(sisa.slice(0, sisa.indexOf("/")));
            continue;
          }
          berkas.push({
            name: sisa,
            metadata: {
              eTag: "etag-uji",
              size: obj.data.length,
              mimetype: obj.contentType,
              cacheControl: obj.cacheControl,
              lastModified: obj.updatedAt,
              contentLength: obj.data.length,
              httpStatusCode: 200,
            },
          });
        }

        const semua: Array<{ name: string; metadata: Record<string, unknown> | null }> = [
          ...[...folder].map((name) => ({ name, metadata: null })),
          ...berkas,
        ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

        kirimJson(res, 200, semua.slice(offset, offset + limit));
        return;
      }

      if (route[0] === "object" && route.length >= 2) {
        const bucket = route[1];
        const path = route.slice(2).join("/");
        const isiBucket = objects.get(bucket);
        if (!isiBucket) {
          kirimJson(res, 404, { message: "bucket tidak ada" });
          return;
        }

        if (req.method === "GET") {
          const obj = isiBucket.get(path);
          if (!obj) {
            kirimJson(res, 404, { message: "objek tidak ada" });
            return;
          }
          downloads += 1;
          res.writeHead(200, {
            "content-type": obj.contentType,
            "content-length": obj.data.length,
            "cache-control": obj.cacheControl,
          });
          res.end(obj.data);
          return;
        }

        if (req.method === "POST") {
          const sudahAda = isiBucket.has(path);
          if (sudahAda && req.headers["x-upsert"] !== "true") {
            kirimJson(res, 409, { message: "objek sudah ada" });
            return;
          }
          const data = await bacaBody(req);
          isiBucket.set(path, {
            data,
            contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
            cacheControl: String(req.headers["cache-control"] ?? "3600"),
            createdAt: waktu,
            updatedAt: waktu,
          });
          uploads.push(`${bucket}/${path}`);
          kirimJson(res, 200, { Key: `${bucket}/${path}` });
          return;
        }

        kirimJson(res, 405, { message: "metode objek tidak didukung" });
        return;
      }

      kirimJson(res, 404, { message: "route tidak dikenal" });
    } catch (error) {
      kirimJson(res, 500, { message: error instanceof Error ? error.message : "error server" });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const alamat = server.address();
  assert.ok(alamat && typeof alamat !== "string");
  const port = (alamat as AddressInfo).port;

  return {
    url: `http://localhost:${port}`,
    targetUrl: `http://127.0.0.1:${port}`,
    buckets,
    objects,
    uploads,
    offsite,
    get requests() {
      return requests;
    },
    get downloads() {
      return downloads;
    },
    get badAuth() {
      return badAuth;
    },
    get offsiteBadAuth() {
      return offsiteBadAuth;
    },
    totalObjects: () => [...objects.values()].reduce((jumlah, isi) => jumlah + isi.size, 0),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function jalankan(
  script: string,
  env: Record<string, string>
): Promise<{ kode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [script], {
      env: { PATH: process.env.PATH ?? "", NODE_ENV: process.env.NODE_ENV ?? "test", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (bagian: Buffer) => {
      stdout += bagian.toString();
    });
    child.stderr.on("data", (bagian: Buffer) => {
      stderr += bagian.toString();
    });
    child.on("error", reject);
    child.on("close", (kode) => resolve({ kode, stdout, stderr }));
  });
}

async function buatStubDocker(dir: string, kodeKeluar: number) {
  const catatan = join(dir, "docker-argv.log");
  const isi = [
    "#!/usr/bin/env bash",
    `printf '%s\\n' "$@" >> ${JSON.stringify(catatan)}`,
    `exit ${kodeKeluar}`,
    "",
  ].join("\n");
  await writeFile(join(dir, "docker"), isi, { mode: 0o755 });
  return catatan;
}

async function backupSekali(sourceUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), "atcell-storage-uji-"));
  const fixture = await mkdtemp(join(tmpdir(), "atcell-storage-fixture-"));
  const passphrase = join(fixture, "passphrase");
  const metadata = join(fixture, "metadata.sql");
  await writeFile(passphrase, `${PASS}\n`, { mode: 0o600 });
  await writeFile(metadata, SQL_METADATA, { mode: 0o600 });

  const hasil = await jalankan(backupScript, {
    BACKUP_DIR: dir,
    STORAGE_SUPABASE_URL: sourceUrl,
    STORAGE_API_KEY: KEY,
    STORAGE_PASSPHRASE_FILE: passphrase,
    BUCKETS,
    STORAGE_METADATA_DUMP_FILE: metadata,
    STORAGE_OFFSITE_PUT_URL: `${sourceUrl.replace(/\/$/, "")}/offsite`,
    STORAGE_OFFSITE_PUT_TOKEN: TOKEN,
  });
  assert.equal(hasil.kode, 0, `backup Storage gagal: ${hasil.stderr}`);

  const nama = (await readdir(dir)).find((n) => /^atcell-storage-.*\.tar\.enc$/.test(n));
  assert.ok(nama, "arsip Storage harus dibuat");
  return {
    dir,
    passphrase,
    archive: join(dir, nama),
    bersihkan: () => rm(dir, { recursive: true, force: true }).then(() =>
      rm(fixture, { recursive: true, force: true })
    ),
  };
}

async function bongkarArsip(archive: string, passphrase: string) {
  const dir = await mkdtemp(join(tmpdir(), "atcell-storage-isi-"));
  const tar = join(dir, "arsip.tar");
  const isi = join(dir, "isi");
  await mkdir(isi);
  await exec("openssl", [
    "enc",
    "-d",
    "-aes-256-cbc",
    "-pbkdf2",
    "-iter",
    "100000",
    "-in",
    archive,
    "-out",
    tar,
    "-pass",
    `file:${passphrase}`,
  ]);
  const daftar = (await exec("tar", ["-tf", tar])).stdout.trim().split("\n").filter(Boolean);
  await exec("tar", ["-xf", tar, "-C", isi]);
  const manifest = JSON.parse(await readFile(join(isi, "manifest.json"), "utf8")) as Manifest;
  return { dir, isi, tar, daftar, manifest };
}

async function tulisSidecar(archive: string) {
  const sha = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(`${archive}.sha256`, `${sha}  ${basename(archive)}\n`);
}

async function buatArsipJahat(dir: string, passphrase: string) {
  const tar = join(dir, "jahat.tar");
  const skrip = [
    "import io, sys, tarfile",
    "with tarfile.open(sys.argv[1], 'w') as t:",
    "    for nama in ('metadata.sql', 'manifest.json', 'evil.txt'):",
    "        t.add(sys.argv[2] + '/' + nama, arcname=nama)",
    "    info = tarfile.TarInfo('../escape.txt')",
    "    data = b'x'",
    "    info.size = len(data)",
    "    t.addfile(info, io.BytesIO(data))",
  ].join("\n");
  const isi = join(dir, "jahat-isi");
  await mkdir(isi);
  await writeFile(join(isi, "metadata.sql"), SQL_METADATA);
  await writeFile(join(isi, "manifest.json"), "{}");
  await writeFile(join(isi, "evil.txt"), "x");
  await exec("python3", ["-c", skrip, tar, isi]);

  const enc = join(dir, "atcell-storage-jahat.tar.enc");
  await exec("openssl", [
    "enc",
    "-aes-256-cbc",
    "-pbkdf2",
    "-iter",
    "100000",
    "-salt",
    "-in",
    tar,
    "-out",
    enc,
    "-pass",
    `file:${passphrase}`,
  ]);
  await tulisSidecar(enc);
  return enc;
}

test("backup Storage membuat arsip kanonik dan mengirim salinan terenkripsi", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const isi = (await readdir(backup.dir)).sort();
  const arsip = basename(backup.archive);
  assert.deepEqual(isi, [arsip, `${arsip}.sha256`].sort(), "hanya arsip terenkripsi dan sidecar");
  assert.ok(!isi.some((n) => n.endsWith(".tar")), "plaintext tar tidak boleh ditinggal");

  const { dir, daftar, manifest, isi: ekstrak } = await bongkarArsip(
    backup.archive,
    backup.passphrase
  );
  t.after(() => rm(dir, { recursive: true, force: true }));

  assert.equal(manifest.created.endsWith("Z"), true);
  assert.equal(manifest.source_host, `localhost:${new URL(source.url).port}`);
  assert.deepEqual(manifest.buckets, BUCKETS.split(","));
  assert.equal(manifest.files.length, source.totalObjects());
  assert.ok(manifest.files.some((f) => f.path === "katalog/2026/satu.jpg"));
  assert.ok(manifest.files.some((f) => f.path === "servis/SRV-20260101-ABCDEF12/awal.jpg"));
  assert.equal(manifest.files.find((f) => f.path === "katalog/2026/dua.jpg")?.mimetype, "image/png");

  for (const berkas of manifest.files) {
    const nyata = await readFile(join(ekstrak, berkas.bucket, berkas.path));
    assert.equal(createHash("sha256").update(nyata).digest("hex"), berkas.sha256);
    assert.equal(nyata.length, berkas.size);
    assert.ok(daftar.includes(`${berkas.bucket}/${berkas.path}`));
  }
  assert.ok(daftar.includes("metadata.sql"));
  assert.ok(daftar.includes("manifest.json"));
  assert.ok(!daftar.some((n) => n.startsWith("/")), "tidak boleh ada path absolut");

  assert.equal(source.uploads.length, 0, "backup tidak boleh mengunggah objek");
  assert.equal(source.badAuth, 0);
  assert.equal(source.offsiteBadAuth, 0);
  assert.ok(source.offsite.has(arsip), "arsip harus dikirim ke off-site");
  assert.ok(source.offsite.has(`${arsip}.sha256`), "sidecar harus dikirim ke off-site");
  assert.equal(source.offsite.get(arsip)?.equals(await readFile(backup.archive)), true);
});

test("backup gagal tertutup tanpa passphrase dan tidak meninggalkan arsip", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const dir = await mkdtemp(join(tmpdir(), "atcell-storage-tanpa-pass-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const gagal = await jalankan(backupScript, {
    BACKUP_DIR: dir,
    STORAGE_SUPABASE_URL: source.url,
    STORAGE_API_KEY: KEY,
    BUCKETS,
    STORAGE_METADATA_DUMP_FILE: join(dir, "tidak-ada.sql"),
    STORAGE_OFFSITE_PUT_URL: `${source.url}/offsite`,
    STORAGE_OFFSITE_PUT_TOKEN: TOKEN,
  });
  assert.notEqual(gagal.kode, 0);
  assert.match(gagal.stderr, /passphrase/i);
  assert.equal((await readdir(dir)).length, 0, "kegagalan passphrase tidak boleh meninggalkan berkas");
  assert.equal(source.requests, 0, "passphrase diperiksa sebelum menyentuh jaringan");
});

test("restore tanpa izin hanya memverifikasi dan tidak menyentuh jaringan", async (t) => {
  const source = await buatStorageServer(true);
  const target = await buatStorageServer(false);
  t.after(() => source.close());
  t.after(() => target.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const hasil = await jalankan(restoreScript, {
    STORAGE_ARCHIVE: backup.archive,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
    STORAGE_RESTORE_URL: target.url,
    STORAGE_RESTORE_DATABASE_URL: DSN,
  });
  assert.equal(hasil.kode, 0, hasil.stderr);
  assert.match(hasil.stdout, /Verifikasi Storage LULUS: 8 objek, 3 bucket/);
  assert.match(hasil.stdout, /Mode verifikasi/);
  assert.equal(target.requests, 0, "mode verifikasi tidak boleh menghubungi target");
  assert.equal(target.uploads.length, 0);
  assert.equal(target.totalObjects(), 0);
});

test("restore penuh membuat bucket, mengunggah, dan memverifikasi hash", async (t) => {
  const source = await buatStorageServer(true);
  const target = await buatStorageServer(false);
  t.after(() => source.close());
  t.after(() => target.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const stub = await mkdtemp(join(tmpdir(), "atcell-storage-docker-"));
  t.after(() => rm(stub, { recursive: true, force: true }));
  const catatanDocker = await buatStubDocker(stub, 0);

  const hasil = await jalankan(restoreScript, {
    PATH: `${stub}:${process.env.PATH ?? ""}`,
    ALLOW_STORAGE_RESTORE: "YES",
    STORAGE_ARCHIVE: backup.archive,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
    STORAGE_RESTORE_URL: target.targetUrl,
    STORAGE_RESTORE_SECRET_KEY: KEY,
    STORAGE_RESTORE_DATABASE_URL: DSN,
  });
  assert.equal(hasil.kode, 0, hasil.stderr);
  assert.match(hasil.stdout, /Restore Storage selesai: 8 objek diunggah, 3 bucket dibuat/);
  assert.match(hasil.stdout, /Verifikasi upload: semua objek cocok/);
  assert.equal(target.buckets.size, 3);
  assert.equal(target.buckets.get("service-photos")?.public, false);
  assert.equal(target.totalObjects(), source.totalObjects());
  assert.equal(
    target.objects.get("product-images")?.get("katalog/2026/satu.jpg")?.data.toString(),
    "katalog-satu"
  );
  assert.equal(target.uploads.length, 8);
  assert.equal(target.downloads, 8, "setiap upload harus diverifikasi dengan unduh ulang");
  assert.equal(target.badAuth, 0);

  const argvDocker = await readFile(catatanDocker, "utf8");
  assert.match(argvDocker, /psql/);
  assert.match(argvDocker, /ON_ERROR_STOP=1/);
  assert.ok(!argvDocker.includes(DSN), "DSN tidak boleh menjadi argv docker");
});

test("restore menolak target yang sama dengan sumber backup", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const stub = await mkdtemp(join(tmpdir(), "atcell-storage-docker-"));
  t.after(() => rm(stub, { recursive: true, force: true }));
  await buatStubDocker(stub, 0);

  const hasil = await jalankan(restoreScript, {
    PATH: `${stub}:${process.env.PATH ?? ""}`,
    ALLOW_STORAGE_RESTORE: "YES",
    STORAGE_ARCHIVE: backup.archive,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
    STORAGE_RESTORE_URL: source.url,
    STORAGE_RESTORE_SECRET_KEY: KEY,
    STORAGE_RESTORE_DATABASE_URL: DSN,
  });
  assert.equal(hasil.kode, 3, hasil.stderr);
  assert.match(hasil.stderr, /sama dengan sumber backup/);
  assert.equal(source.uploads.length, 0);
});

test("restore menolak bucket target yang sudah ada tanpa izin timpa", async (t) => {
  const source = await buatStorageServer(true);
  const target = await buatStorageServer(true);
  t.after(() => source.close());
  t.after(() => target.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const stub = await mkdtemp(join(tmpdir(), "atcell-storage-docker-"));
  t.after(() => rm(stub, { recursive: true, force: true }));
  await buatStubDocker(stub, 0);

  const hasil = await jalankan(restoreScript, {
    PATH: `${stub}:${process.env.PATH ?? ""}`,
    ALLOW_STORAGE_RESTORE: "YES",
    STORAGE_ARCHIVE: backup.archive,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
    STORAGE_RESTORE_URL: target.targetUrl,
    STORAGE_RESTORE_SECRET_KEY: KEY,
    STORAGE_RESTORE_DATABASE_URL: DSN,
  });
  assert.equal(hasil.kode, 4, hasil.stderr);
  assert.match(hasil.stderr, /sudah ada di target/);
  assert.equal(target.uploads.length, 0);
  assert.equal(target.totalObjects(), source.totalObjects(), "isi target tidak boleh berubah");
});

test("restore menolak checksum arsip yang tidak cocok", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const rusak = join(backup.dir, "atcell-storage-rusak.tar.enc");
  await copyFile(backup.archive, rusak);
  await tulisSidecar(rusak);
  await writeFile(rusak, Buffer.concat([await readFile(rusak), Buffer.from("x")]));

  const hasil = await jalankan(restoreScript, {
    STORAGE_ARCHIVE: rusak,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
  });
  assert.equal(hasil.kode, 2, hasil.stderr);
  assert.match(hasil.stderr, /checksum|tidak cocok/i);
});

test("restore menolak arsip dengan anggota di luar jalur aman", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const jahat = await buatArsipJahat(backup.dir, backup.passphrase);
  const hasil = await jalankan(restoreScript, {
    STORAGE_ARCHIVE: jahat,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
  });
  assert.equal(hasil.kode, 2, hasil.stderr);
  assert.match(hasil.stderr, /tidak aman/);
});

test("restore gagal dengan exit 5 bila metadata tidak bisa diterapkan", async (t) => {
  const source = await buatStorageServer(true);
  const target = await buatStorageServer(false);
  t.after(() => source.close());
  t.after(() => target.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const stub = await mkdtemp(join(tmpdir(), "atcell-storage-docker-"));
  t.after(() => rm(stub, { recursive: true, force: true }));
  await buatStubDocker(stub, 1);

  const hasil = await jalankan(restoreScript, {
    PATH: `${stub}:${process.env.PATH ?? ""}`,
    ALLOW_STORAGE_RESTORE: "YES",
    STORAGE_ARCHIVE: backup.archive,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
    STORAGE_RESTORE_URL: target.targetUrl,
    STORAGE_RESTORE_SECRET_KEY: KEY,
    STORAGE_RESTORE_DATABASE_URL: DSN,
  });
  assert.equal(hasil.kode, 5, hasil.stderr);
  assert.match(hasil.stderr, /metadata/);
  assert.equal(target.uploads.length, 0, "upload tidak boleh jalan bila metadata gagal");
});

test("drill memilih arsip terbaru dan gagal bila direktori kosong", async (t) => {
  const source = await buatStorageServer(true);
  t.after(() => source.close());
  const backup = await backupSekali(source.url);
  t.after(backup.bersihkan);

  const lama = join(backup.dir, "atcell-storage-19990101T000000Z.tar.enc");
  await writeFile(lama, "bukan arsip");
  await tulisSidecar(lama);
  const waktuLama = new Date("1999-01-01T00:00:00Z");
  await utimes(lama, waktuLama, waktuLama);
  await utimes(`${lama}.sha256`, waktuLama, waktuLama);
  assert.ok((await stat(backup.archive)).mtimeMs > (await stat(lama)).mtimeMs);

  const drill = await jalankan(drillScript, {
    STORAGE_BACKUP_DIR: backup.dir,
    STORAGE_PASSPHRASE_FILE: backup.passphrase,
  });
  assert.equal(drill.kode, 0, drill.stderr);
  assert.match(drill.stdout, /Drill Storage LULUS/);
  assert.ok(!drill.stdout.includes("19990101T000000Z"), "drill harus memilih arsip terbaru");

  const kosong = await mkdtemp(join(tmpdir(), "atcell-storage-kosong-"));
  t.after(() => rm(kosong, { recursive: true, force: true }));
  const tidakAda = await jalankan(drillScript, { STORAGE_BACKUP_DIR: kosong });
  assert.notEqual(tidakAda.kode, 0);
  assert.match(tidakAda.stderr, /tidak ada atcell-storage/);
});
