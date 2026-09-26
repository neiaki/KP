# Build image At Cell di luar VPS.
#
# ARSITEKTUR: build Next.js butuh 1,5-2 GB RAM. VPS produksi hanya 2 GB dan
# sudah menjalankan Coolify (panel, PostgreSQL, Redis, Traefik) plus aplikasinya,
# jadi build di sana akan menguras seluruh memori host dan membuat VPS tidak
# merespons. Image ini dibangun di GitHub Actions, lalu Coolify hanya menarik dan
# menjalankannya. Build tidak pernah menyentuh VPS lagi.
#
# Pakai mode webpack karena image produksi dibangun lewat Docker, bukan Nixpacks.

# ---------- base ----------
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
# Node 22 masih butuh legacy-peer-deps untuk Next 16 + React 19.
RUN npm ci --legacy-peer-deps

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Batasi heap build supaya tidak keluar jalur heap default yang boros.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build -- --webpack

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Coolify menjalankan health check dengan:
#   curl -s -X GET -f http://localhost:3000/api/health/ready
# dan jatuh ke wget kalau curl tidak ada. node:22-bookworm-slim tidak
# menyediakan keduanya, jadi health check selalu gagal, container ditandai
# unhealthy lalu dibunuh, dan deploy dianggap gagal meski aplikasinya jalan.
# Karena itu curl wajib ada di image runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/public ./public
# .next sudah berisi output webpack. Folder cache next/image akan ditulis
# runtime oleh user node, jadi harus writable.
COPY --from=builder --chown=node:node /app/.next ./.next
# Disalin penuh supaya `npm start` berperilaku sama persis dengan build lokal.
# next.config tidak memakai `output: standalone`, jadi node_modules wajib ada.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./

# next.config.ts WAJIB ada di image. Tanpa ini `next start` hanya bergantung pada
# config yang dibekukan di .next/required-server-files.json, sehingga opsi yang
# dibaca runtime seperti poweredByHeader diam-diam kembali ke default dan
# X-Powered-By bocor ke klien.
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
# tsconfig.json dibutuhkan Next.js untuk resolve path saat runtime.
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/next-env.d.ts ./next-env.d.ts

USER node

EXPOSE 3000

# Healthcheck sengaja tidak didefinisikan di sini. Coolify sudah memasang
# healthcheck sendiri lewat compose yang ia hasilkan, dan image yang punya
# HEALTHCHECK akan bentrok dengan itu sehingga container gagal start.
# Definisi healthcheck ada di docker-compose.coolify.yml.

CMD ["npm", "start"]
