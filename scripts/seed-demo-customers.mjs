// Skrip satu kali untuk membuat tiga akun pelanggan demo beserta riwayat
// pembelian yang terlihat di portal pelanggan.
//
// Default dry-run. Menulis ke production hanya dengan --apply DAN
// ALLOW_PRODUCTION_WRITE=1. Kredensial dibaca dari env, tidak pernah dicetak.
//
// Unit dan transaksi demo selalu diberi is_demo = true. Unit demo memakai
// imei NULL: IMEI adalah identitas perangkat fisik, jadi nomor karangan tidak
// boleh dipakai bahkan untuk data contoh. View etalase publik dan laporan
// penjualan sudah mengecualikan baris demo, sehingga data ini hanya muncul di
// riwayat akun pelanggan contoh.

import process from "node:process";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;

const env = (k) => process.env[k];

const url = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
const allowWrite = env("ALLOW_PRODUCTION_WRITE") === "1";

/**
 * Baca variabel pertama yang terisi. File kredensial lama memakai
 * DEMO_EGA_*, sedangkan template baru memakai DEMO_CUSTOMER_*_EGA; keduanya
 * harus bisa dipakai tanpa menyalin rahasia ke nama variabel lain.
 */
const envFirst = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
};

function demoAccount({ slug, fullName, defaultPhone, preferredProduct }) {
  const upper = slug.toUpperCase();
  const username =
    envFirst(`DEMO_CUSTOMER_USERNAME_${upper}`, `DEMO_${upper}_USERNAME`) || slug;
  return {
    username,
    fullName,
    email:
      envFirst(`DEMO_CUSTOMER_EMAIL_${upper}`, `DEMO_${upper}_EMAIL`) ||
      `${username}@pelanggan.atcell.my.id`,
    phone:
      envFirst(`DEMO_CUSTOMER_PHONE_${upper}`, `DEMO_${upper}_PHONE`) ||
      defaultPhone,
    password: envFirst(
      `DEMO_CUSTOMER_PASSWORD_${upper}`,
      `DEMO_${upper}_PASSWORD`
    ),
    preferredProduct,
  };
}

const demoAccounts = [
  demoAccount({
    slug: "ega",
    fullName: "Ega",
    defaultPhone: "081200000001",
    preferredProduct: { brand: "Apple", model: "iPhone 15 Pro 128GB" },
  }),
  demoAccount({
    slug: "febiyanto",
    fullName: "Febiyanto",
    defaultPhone: "081200000002",
    preferredProduct: { brand: "Samsung", model: "Galaxy S24 Ultra 256GB" },
  }),
  demoAccount({
    slug: "hilmi",
    fullName: "Hilmi",
    defaultPhone: "081200000003",
    preferredProduct: { brand: "Xiaomi", model: "Redmi Note 13 8/256GB" },
  }),
];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

for (const a of demoAccounts) {
  const digits = a.phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) {
    fail(`Nomor HP ${a.username} harus berisi 9 sampai 15 digit.`);
  }
}

if (apply) {
  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_URL wajib diisi.");
  if (!serviceKey) fail("SUPABASE_SECRET_KEY atau SUPABASE_SERVICE_ROLE_KEY wajib diisi.");
  if (!allowWrite) fail("Tulis ke production butuh ALLOW_PRODUCTION_WRITE=1.");
  for (const a of demoAccounts) {
    if (!a.password || a.password.length < 8) {
      fail(`Password untuk ${a.username} wajib diisi minimal 8 karakter lewat env.`);
    }
  }
}

console.log(dryRun ? "MODE: dry-run (tidak menulis)" : "MODE: apply (menulis ke database)");
for (const a of demoAccounts) {
  console.log(
    `- ${a.username}: ${a.email} (${a.phone}) -> ${a.preferredProduct.brand} ${a.preferredProduct.model}`
  );
}

// Dry-run tetap berguna tanpa kredensial: ia mencetak rencana akun. Kalau
// kredensial tersedia, rencana produk ikut diverifikasi supaya owner bisa
// melihat model mana yang akan dipakai sebelum memberi izin tulis.
if (!url || !serviceKey) {
  if (apply) fail("Kredensial Supabase wajib diisi untuk --apply.");
  console.log("Kredensial tidak tersedia; rencana produk belum diverifikasi.");
  console.log("Dry-run selesai. Jalankan dengan --apply setelah izin owner.");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Pastikan migrasi demo sudah diterapkan sebelum menyentuh data. */
async function checkDemoSchema() {
  const unit = await admin.from("inventory_units").select("id,is_demo").limit(1);
  if (unit.error) {
    fail(
      `Kolom is_demo belum ada di inventory_units. Terapkan migrasi 20261023111914 dan 20261023112316 dulu. Detail: ${unit.error.message}`
    );
  }
  const tx = await admin.from("transactions").select("id,is_demo").limit(1);
  if (tx.error) {
    fail(
      `Kolom is_demo belum ada di transactions. Terapkan migrasi 20261023111914 dulu. Detail: ${tx.error.message}`
    );
  }
}

/** Pilih produk aktif dengan harga acuan > 0; utamakan model yang diminta. */
async function pilihProduk(preferred) {
  const { data, error } = await admin
    .from("products")
    .select("id,brand,model_name,default_price,is_active")
    .eq("is_active", true)
    .gt("default_price", 0)
    .order("id", { ascending: true });
  if (error) throw error;
  const produk = data ?? [];
  const cocok = produk.find(
    (p) =>
      p.brand.toLowerCase() === preferred.brand.toLowerCase() &&
      p.model_name.toLowerCase() === preferred.model.toLowerCase()
  );
  if (cocok) return { produk: cocok, fallback: false };
  if (produk.length === 0) {
    throw new Error("Tidak ada produk aktif dengan harga acuan di atas nol.");
  }
  return { produk: produk[0], fallback: true };
}

async function buatAkun(a) {
  const { data: existing, error: lookupErr } = await admin
    .from("profiles")
    .select("id,username,full_name,phone_number,email")
    .eq("username", a.username)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (existing) {
    console.log(`LEWATI akun ${a.username}: sudah ada.`);
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: a.email,
    password: a.password,
    email_confirm: true,
    user_metadata: {
      full_name: a.fullName,
      phone_number: a.phone,
      username: a.username,
    },
  });
  if (error || !data.user) throw error || new Error("createUser gagal");

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .update({
      full_name: a.fullName,
      phone_number: a.phone,
      role: "customer",
      username: a.username,
      email: a.email,
    })
    .eq("id", data.user.id)
    .select("id,username,full_name,phone_number,email")
    .maybeSingle();
  if (profileErr || !profile) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw profileErr || new Error("profil pelanggan tidak terbentuk");
  }
  console.log(`DIBUAT akun ${a.username}`);
  return profile;
}

async function buatRiwayat(a, profile) {
  const { data: existingTx, error: existingErr } = await admin
    .from("transactions")
    .select("id,invoice_number")
    .eq("customer_id", profile.id)
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existingTx) {
    console.log(`LEWATI riwayat ${a.username}: transaksi demo sudah ada.`);
    return false;
  }

  const { produk, fallback } = await pilihProduk(a.preferredProduct);
  if (fallback) {
    console.warn(
      `PERINGATAN ${a.username}: model ${a.preferredProduct.brand} ${a.preferredProduct.model} tidak ditemukan, memakai ${produk.brand} ${produk.model_name}.`
    );
  }
  const harga = String(produk.default_price);

  // Unit demo tidak punya IMEI. Jangan mengarang 15 digit: nomor itu akan
  // terlihat seperti perangkat nyata di nota dan tidak bisa diverifikasi.
  const { data: unit, error: unitErr } = await admin
    .from("inventory_units")
    .insert({
      product_id: produk.id,
      imei: null,
      condition: "new",
      status: "sold",
      purchase_cost: "0",
      selling_price: harga,
      is_demo: true,
    })
    .select("id")
    .single();
  if (unitErr || !unit) throw unitErr || new Error("gagal membuat unit demo");

  try {
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .insert({
        sales_id: null,
        customer_id: profile.id,
        customer_name: profile.full_name || a.fullName,
        customer_phone: profile.phone_number || a.phone,
        total_amount: harga,
        trade_in_deduction: "0",
        final_payment: harga,
        payment_method: "cash",
        is_demo: true,
      })
      .select("id,invoice_number")
      .single();
    if (txErr || !tx) throw txErr || new Error("gagal membuat transaksi demo");

    try {
      const { error: itemErr } = await admin.from("transaction_items").insert({
        transaction_id: tx.id,
        unit_id: unit.id,
        unit_price: harga,
        warranty_duration_months: 12,
      });
      if (itemErr) throw itemErr;
    } catch (itemErr) {
      // Rollback baris yang baru dibuat skrip ini saja, bukan data toko.
      await admin.from("transactions").delete().eq("id", tx.id);
      throw itemErr;
    }

    console.log(
      `RIWAYAT ${a.username}: ${tx.invoice_number} - ${produk.brand} ${produk.model_name} (${harga})`
    );
    return true;
  } catch (err) {
    await admin.from("inventory_units").delete().eq("id", unit.id);
    throw err;
  }
}

if (dryRun) {
  // Validasi skema dan produk tanpa menulis.
  await checkDemoSchema();
  for (const a of demoAccounts) {
    try {
      const { produk, fallback } = await pilihProduk(a.preferredProduct);
      console.log(
        `RENCANA ${a.username}: ${produk.brand} ${produk.model_name} (${produk.default_price})${fallback ? " [fallback]" : ""}`
      );
    } catch (err) {
      console.error(`GAGAL merencanakan ${a.username}: ${err?.message || err}`);
      process.exitCode = 1;
    }
  }
  console.log("Dry-run selesai. Jalankan dengan --apply setelah izin owner.");
  process.exit(process.exitCode ?? 0);
}

await checkDemoSchema();

let created = 0;
let skipped = 0;
let purchases = 0;
let failed = 0;

for (const a of demoAccounts) {
  try {
    const before = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("username", a.username);
    const alreadyExists = (before.count ?? 0) > 0;
    const profile = await buatAkun(a);
    if (!alreadyExists) created++;
    else skipped++;

    if (await buatRiwayat(a, profile)) purchases++;
  } catch (e) {
    console.error(`GAGAL ${a.username}: ${e?.message || e}`);
    failed++;
  }
}

console.log(
  `Ringkasan: akun dibuat=${created}, akun dilewati=${skipped}, riwayat dibuat=${purchases}, gagal=${failed}`
);
if (failed > 0) process.exitCode = 1;
