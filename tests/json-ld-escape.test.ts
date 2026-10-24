import test from "node:test";
import assert from "node:assert/strict";
import { escapeJsonLd, buildLocalBusinessJsonLd } from "../src/app/sitemap.ts";

/*
 * F3-02 XSS: satu-satunya sink HTML berbahaya di aplikasi ini adalah blok
 * <script type="application/ld+json"> yang isinya JSON.stringify dari nilai
 * yang dikelola Admin (nama toko, alamat, deskripsi). JSON.stringify tidak
 * meng-escape "<", jadi nilai yang memuat "</script>" bisa menutup blok
 * lebih awal dan menyuntikkan tag baru di halaman publik. escapeJsonLd
 * menutup jalur itu; tes ini menguncinya.
 */

test('escapeJsonLd mengganti setiap "<" dengan "\\u003c"', () => {
  // Hanya "<" yang di-escape: penutupan </script> butuh karakter itu, dan
  // ">" sendirian tidak berbahaya. Kontrak pentingnya: output tidak pernah
  // memuat "</script>" literal.
  assert.equal(escapeJsonLd("</script>"), "\\u003c/script>");
  assert.equal(escapeJsonLd("Toko <b>HP</b>"), "Toko \\u003cb>HP\\u003c/b>");
  assert.equal(escapeJsonLd("Toko HP jujur"), "Toko HP jujur");
  assert.equal(escapeJsonLd(""), "");
});

test("payload penutup tag script tidak pernah lolos setelah di-escape", () => {
  const berbahaya = '</script><script>alert(1)</script>';
  const aman = escapeJsonLd(JSON.stringify({ name: berbahaya }));
  assert.ok(!aman.includes("</script>"), "output tidak boleh memuat </script> literal");
  // Tetap valid sebagai JSON: parse balik mengembalikan nilai asli.
  assert.equal(JSON.parse(aman).name, berbahaya);
});

test("LocalBusiness dengan nama toko berbahaya tetap tidak menyuntik tag", () => {
  const settings = {
    id: 1,
    store_name: "</script><script>alert(1)</script>",
    description_id: "Alamat </script> injeksi",
    description_en: "Address </script> injection",
    address: "</script> Jl. Test 123",
    latitude: -6.2,
    longitude: 106.8,
    phone_number: "081200000000",
    social_facebook: "",
    social_instagram: "",
    social_x: "",
    social_tiktok: "",
    opening_hours: { monday_friday: "", saturday_sunday: "" },
    updated_at: "2026-10-24T00:00:00Z",
    whatsapp_number: "6281200000000",
  } as Parameters<typeof buildLocalBusinessJsonLd>[0]["settings"];

  const jsonLd = buildLocalBusinessJsonLd({
    origin: "https://atcell.my.id",
    settings,
    reviews: null,
    imagePath: "/images/store.jpg",
  });
  const aman = escapeJsonLd(JSON.stringify(jsonLd));
  assert.ok(!aman.includes("</script>"), "markup tidak boleh memuat </script> literal");
  assert.equal(JSON.parse(aman).name, settings.store_name, "nilai asli tetap terbaca Google");
});
