import type { NextConfig } from "next";

const configuredOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const serverActionOrigins = Array.from(
  new Set(["atcell.my.id", "*.atcell.my.id", "atcell-web.vercel.app", ...configuredOrigins])
);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload validasi menerima 5 MB; sisakan ruang untuk multipart overhead.
      bodySizeLimit: "6mb",
      allowedOrigins: serverActionOrigins,
    },
  },
};

export default nextConfig;
