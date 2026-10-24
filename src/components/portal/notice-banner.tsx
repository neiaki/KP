"use client";

import React from "react";
import { X } from "lucide-react";

/*
 * Banner notifikasi bersama halaman portal (sukses/gagal).
 *
 * Sebelumnya pola ini disalin di customers dan listing; dua salinan pasti
 * berbeda diam-diam (sudah terjadi: ukuran tombol tutup). Markup di bawah
 * identik dengan versi lama customers supaya perilaku dan visual tidak
 * berubah saat halaman bermigrasi ke komponen ini.
 */
export function NoticeBanner({
  notice,
  onClose,
}: {
  notice: { type: "error" | "success"; text: string } | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  return (
    <div
      role={notice.type === "error" ? "alert" : "status"}
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-semibold ${
        notice.type === "error" ? "border-bad/20 bg-bad-bg text-bad" : "border-good/20 bg-good-bg text-good"
      }`}
    >
      <span>{notice.text}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup pemberitahuan"
        className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:opacity-70"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
