This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Project ini memakai mode dua:

- **Demo lokal:** tanpa environment Supabase, data portal memakai mock dan
  `localStorage`.
- **Production:** Supabase/Drizzle menjadi sumber data bersama. Coolify menjadi
  primary dan Vercel menjadi standby. Jangan memakai data mock sebagai fallback
  production.

Runbook lengkap untuk migration, environment, health check, DNS, backup, dan
rollout ada di [`docs/DEPLOYMENT-REDUNDANCY.md`](docs/DEPLOYMENT-REDUNDANCY.md).

Health endpoint:

- `GET /api/health/live`
- `GET /api/health/ready`

Verifikasi lokal:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Vercel Hobby tidak boleh dipakai untuk deployment bisnis At Cell. Upgrade ke
Pro atau Enterprise sebelum production.

Backup database production:

```bash
SOURCE_DATABASE_URL="..." BACKUP_DIR="/path/backup" npm run backup:postgres
ALLOW_RESTORE=YES RESTORE_DATABASE_URL="..." DUMP_FILE="/path/backup/atcell-....dump" npm run restore:postgres
```

Restore bersifat destruktif dan hanya boleh diarahkan ke database restore
sementara untuk pengujian, bukan database production.
