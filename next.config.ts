import type { NextConfig } from "next";

const configuredOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const serverActionOrigins = Array.from(
  new Set(["atcell.my.id", "*.atcell.my.id", ...configuredOrigins])
);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // HSTS hanya bermakna di produksi. Tanpa precondition, cookie sesi bisa
  // terkirim lewat HTTP saat isomorphic dan memancing browser menyimpan header ini.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

// Foto produk kini diambil dari Supabase Storage (bucket product-images), bukan
// file lokal di public/. Host Storage dihitung dari env, bukan ditulis mati,
// supaya tidak ikut bocor ke repo kalau project Supabase diganti.
const supabaseStorageHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(supabaseStorageHost
    ? {
        images: {
          remotePatterns: [
            {
              protocol: "https" as const,
              hostname: supabaseStorageHost,
              pathname: "/storage/v1/object/public/product-images/**",
            },
          ],
        },
      }
    : {}),
  experimental: {
    serverActions: {
      // Upload validasi menerima 5 MB; sisakan ruang untuk multipart overhead.
      bodySizeLimit: "6mb",
      allowedOrigins: serverActionOrigins,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
