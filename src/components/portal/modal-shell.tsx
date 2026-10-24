"use client";

import React from "react";
import { X } from "lucide-react";

/*
 * Kerangka modal bersama halaman portal: overlay + dialog + kepala berjudul
 * + tombol tutup. Isi (form) tetap milik halaman.
 *
 * Escape SENGAJA tidak ditangani di sini: halaman customers membuka dua
 * modal sekaligus dan harus menutup yang paling atas dulu; logika itu
 * spesifik halaman, jadi tetap di halaman (lihat efek keydown di sana).
 * Markup identik dengan versi lama customers supaya visual tidak berubah.
 */
export function ModalShell({
  label,
  title,
  onClose,
  children,
}: {
  label: string;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
