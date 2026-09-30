import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Pengaman untuk aplikasi Android At Cell (android/).
 *
 * APK adalah berkas biner yang tidak bisa direview. Kalau ada yang secara
 * tidak sengaja menambah izin, membuka HTTP biasa, atau menandatangani dengan
 * kunci debug, akibatnya baru ketahuan setelah APK keluar dari Play, dan
 * gejalanya di HP cuma "app ini mungkin berbahaya" tanpa penjelasan.
 *
 * Test di sini mengunci invarian yang paling sering dilanggar dan paling
 * Trusted diperiksa pemindai:
 *
 *  1. Tidak ada izin yang diminta. Trusted Web Activity tidak butuh izin apa
 *     pun, dan izin yang tidak terpakai adalah sinyal mencurigakan terkuat.
 *  2. Cleartext traffic mati dan network security config menutup HTTP.
 *  3. Backup data mati, supaya cookie sesi portal tidak ikut tersalin.
 *  4. Hanya launcher yang exported.
 *  5. Release build memakai keystore, bukan kunci debug, dan R8 menyala.
 *  6. Package name dan host sama dengan yang diklaim Digital Asset Links.
 *
 * Semua ini diuji secara statis atas berkas sumber. Build-nya butuh Android
 * SDK, jadi tidak bisa dijalankan di runner Node; yang dikunci di sini adalah
 * keputusan yang membuat build itu aman, bukan hasil build-nya.
 */

function baca(rel: string): string {
  return readFileSync(new URL("../" + rel, import.meta.url), "utf8");
}

const manifest = baca("android/app/src/main/AndroidManifest.xml");
const appBuild = baca("android/app/build.gradle");
const networkConfig = baca("android/app/src/main/res/xml/network_security_config.xml");
const dataExtraction = baca(
  "android/app/src/main/res/xml/data_extraction_rules.xml"
);
const proguard = baca("android/app/proguard-rules.pro");
const twaManifest = baca("android/app/src/main/assets/twa-manifest.json");
const gitignore = baca("android/.gitignore");

test("tidak ada izin yang diminta di manifest", () => {
  const permissions = [
    ...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(
    permissions,
    [],
    "TWA tidak butuh izin apa pun. Izin yang tidak terpakai adalah salah " +
      "satu sinyal paling kuat bahwa APK mencurigakan. Ditemukan: " +
      permissions.join(", ")
  );
});

test("cleartext traffic mati di manifest dan di network security config", () => {
  assert.ok(
    /android:usesCleartextTraffic="false"/.test(manifest),
    "usesCleartextTraffic harus false"
  );
  assert.ok(
    /cleartextTrafficPermitted="false"/.test(networkConfig),
    "network security config harus menutup cleartext"
  );
  // base-config menutup semua, termasuk localhost yang kalau tidak
  // dimatikan tetap boleh dibuka WebView.
  assert.ok(
    !/<domain[^>]*>localhost<\/domain>\s*(?!.*cleartextTrafficPermitted="false")/.test(
      networkConfig
    ) || /cleartextTrafficPermitted="false"[\s\S]*localhost[\s\S]*127\.0\.0\.1/.test(networkConfig),
    "localhost harus tetap tanpa cleartext"
  );
  assert.ok(
    /<certificates src="system" \/>/.test(networkConfig),
    "hanya sertifikat sistem yang dipercaya, sertifikat user-added tidak"
  );
});

test("backup data dimatikan supaya cookie sesi portal tidak ikut tersalin", () => {
  assert.ok(
    /android:allowBackup="false"/.test(manifest),
    "allowBackup harus false"
  );
  assert.ok(
    /android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest),
    "dataExtractionRules harus menunjuk xml-nya"
  );
  for (const domain of ["root", "database", "sharedpref", "external"]) {
    const adaDiCloud = new RegExp(
      `cloud-backup>[\\s\\S]*?exclude domain="${domain}"`
    ).test(dataExtraction);
    const adaDiTransfer = new RegExp(
      `device-transfer>[\\s\\S]*?exclude domain="${domain}"`
    ).test(dataExtraction);
    assert.ok(
      adaDiCloud && adaDiTransfer,
      `domain ${domain} harus dikecualikan di cloud-backup dan device-transfer`
    );
  }
});

test("hanya launcher activity yang exported", () => {
  const activities = [
    ...manifest.matchAll(
      /<activity[\s\S]*?android:name="([^"]+)"[\s\S]*?android:exported="([^"]+)"[\s\S]*?>/g
    ),
  ];
  assert.ok(activities.length >= 3, "manifest harus punya beberapa activity");

  for (const [, name, exported] of activities) {
    if (name.includes("AtCellLauncherActivity")) {
      assert.equal(
        exported,
        "true",
        "launcher wajib exported supaya bisa dibuka dari layar utama"
      );
      continue;
    }
    assert.equal(
      exported,
      "false",
      name + " tidak boleh exported: hanya launcher yang boleh terlihat dari luar app"
    );
  }
});

test("service, provider, dan receiver milik library ikut private", () => {
  for (const name of [
    "my.id.atcell.AtCellDelegationService",
    "androidx.core.content.FileProvider",
  ]) {
    assert.ok(manifest.includes(name), name + " harus ada di manifest");
  }
  const service = manifest.slice(
    manifest.indexOf("AtCellDelegationService")
  );
  assert.ok(
    /android:exported="false"/.test(service),
    "DelegationService tidak boleh exported"
  );
});

test("DelegationService dimatikan karena push belum dipakai", () => {
  assert.ok(
    /android:enabled="@bool\/enableNotification"/.test(manifest),
    "service harus dikendalikan resValue enableNotification"
  );
  assert.ok(
    /resValue 'bool', 'enableNotification', 'false'/.test(appBuild),
    "enableNotification harus false sampai At Cell benar-benar punya push"
  );
  assert.equal(
    twaManifest.includes('"enableNotifications": false'),
    true,
    "twa-manifest.json juga harus menyebut enableNotifications false"
  );
});

test("release build memakai keystore dan tidak pernah kunci debug", () => {
  assert.ok(
    /signingConfigs/.test(appBuild) && /gradle\/signing\.properties/.test(appBuild),
    "release signing config harus dibaca dari gradle/signing.properties"
  );
  assert.ok(
    /minifyEnabled true/.test(appBuild),
    "R8 harus menyala di release: APK tanpa minify lebih besar dan lebih mudah dibaca pemindai"
  );
  assert.ok(
    /shrinkResources true/.test(appBuild),
    "shrinkResources harus menyala di release"
  );
  // Kalau signingConfig null, build harus gagal, bukan jatuh ke debug key.
  assert.ok(
    /signingConfig[\s\S]*?\?\s*signingConfigs\.release\s*\n\s*:\s*null/.test(
      appBuild
    ),
    "kalau signing.properties tidak ada, signingConfig harus null supaya " +
      "build gagal, bukan menandatangani dengan kunci debug"
  );
});

test("proguard mempertahankan kelas yang dibaca lewat metadata XML", () => {
  for (const pola of [
    "com.google.androidbrowserhelper.**",
    "androidx.browser.customtabs.**",
    "my.id.atcell.AtCellLauncherActivity",
    "my.id.atcell.AtCellDelegationService",
  ]) {
    assert.ok(
      proguard.includes(`-keep class ${pola}`) ||
        proguard.includes(`-keep class ${pola} {`),
      "proguard harus mempertahankan " + pola + ", tanpa itu app rusak saat dibuka"
    );
  }
});

test("targetSdk dan minSdk sesuai untuk Play Store", () => {
  // Play Store mewajibkan targetSdk terbaru; minSdk 24 dipilih karena TWA
  // butuh WebView yang modern dan pengguna yang lebih tua bisa pakai PWA.
  assert.match(appBuild, /targetSdk 36/);
  assert.match(appBuild, /minSdk 24/);
  assert.match(appBuild, /compileSdk 36/);
});

test("package name dan host sama persis dengan assetlinks", () => {
  assert.match(appBuild, /applicationId 'my\.id\.atcell'/);
  assert.match(appBuild, /namespace 'my\.id\.atcell'/);
  assert.match(appBuild, /resValue 'string', 'hostName', 'atcell\.my\.id'/);
  assert.match(twaManifest, /"packageId": "my\.id\.atcell"/);
  assert.match(twaManifest, /"hostName": "atcell\.my\.id"/);
  // Nilai ini juga dikunci di src/lib/assetlinks.ts dan tests/assetlinks.test.ts.
  assert.match(manifest, /android:host="@string\/hostName"/);
});

test("autoVerify aktif supaya Digital Asset Links benar-benar dicek", () => {
  assert.ok(
    /<intent-filter android:autoVerify="true">[\s\S]*?android:host="@string\/hostName"/.test(
      manifest
    ),
    "intent-filter VIEW harus autoVerify dan memakai host yang sama dengan " +
      "yang ada di assetlinks.json"
  );
});

test("kunci tanda tangan dan kredensial tidak boleh masuk git", () => {
  for (const pola of [
    "gradle/signing.properties",
    "*.jks",
    "*.keystore",
    "local.properties",
    "*.apk",
  ]) {
    assert.ok(
      gitignore.includes(pola),
      "android/.gitignore harus mengabaikan " + pola
    );
  }
});

test("jcenter tidak dipakai karena sudah mati sejak 2022", () => {
  // Komentar dibuang dulu. Tanpa itu, penyebutan jcenter() di komentar penjelas
  // akan membuat test ini gagal terus padahal repository-nya memang sudah
  // bersih.
  const tanpaKomentar = baca("android/build.gradle").replace(
    /^\s*\/\/.*$/gm,
    ""
  );
  assert.ok(
    !tanpaKomentar.includes("jcenter()"),
    "jcenter() sudah ditutup JFrog, build akan gagal dengan pesan yang tidak menjelaskan penyebab"
  );
  assert.ok(tanpaKomentar.includes("mavenCentral()"));
  assert.ok(tanpaKomentar.includes("google()"));
});

test("shortcut di APK sama dengan shortcut di manifest web", () => {
  const shortcuts = baca("android/app/src/main/res/xml/shortcuts.xml");
  // Empat shortcut dan empat URL yang sama dengan src/app/manifest.ts.
  for (const url of [
    "https://atcell.my.id/id/catalog",
    "https://atcell.my.id/id/tracking",
    "https://atcell.my.id/id/trade-in",
    "https://atcell.my.id/portal",
  ]) {
    assert.ok(
      shortcuts.includes(url),
      url + " harus ada di shortcuts.xml, sama seperti di manifest web"
    );
  }
  // <shortcuts dan </shortcuts> juga mengandung kata "shortcut", jadi yang
  // dihitung hanya tag pembuka <shortcut yang punya atribut.
  assert.equal(
    (shortcuts.match(/<shortcut\s+android:shortcutId=/g) ?? []).length,
    4,
    "Android hanya menerima maksimal 4 shortcut"
  );
});
