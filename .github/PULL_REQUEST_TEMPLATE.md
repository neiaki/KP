# Judul perubahan

Satu baris, gaya commit Conventional Commits.

## Apa yang berubah

Ringkas per file atau per modul. Sebut route, Server Action, atau migration yang
ikut berubah kalau ada.

## Kenapa

Masalah nyata yang membuat perubahan ini perlu, atau alasan kenapa tidak perlu
diubah. Cantumkan issue terkait kalau ada.

## Verifikasi

Tempel hasil komando berikut apa adanya, bukan ringkasan. Kalau ada yang gagal,
tulis gagal dan kenapa, jangan dipotong.

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Kalau menyentuh deployment

- Image production tidak boleh memakai tag `latest`. Tag di `Dockerfile.coolify`
  wajib berbentuk `sha-<commit>`, dan `tests/deploy-image-pin.test.ts` akan
  menolak yang lain.
- Kalau ada migration baru, daftarkan di tabel migration di
  `docs/DEPLOYMENT-REDUNDANCY.md`. Migration yang tidak tercatat di sana akan
  terlewat saat restore test.
- Kalau ada secret atau env baru, catat di bagian environment pada
  `docs/DEPLOYMENT-REDUNDANCY.md` dan pastikan tidak ikut ter-commit.
