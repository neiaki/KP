"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/* Dropdown custom pengganti <select> bawaan. Alasan: arah popup <select>
   ditentukan browser (sering terbuka ke atas) dan warnanya mengikuti tema
   browser (teks gelap di atas popup gelap = tidak terbaca). Komponen ini
   selalu terbuka ke bawah dan memakai token tema aplikasi. */

export type DropSection = {
  heading?: string;
  options: Array<{ value: string; label: string }>;
};

export function DropSelect({
  id,
  label,
  value,
  sections,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  sections: DropSection[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flat = sections.flatMap((s) => s.options);
  const display = flat.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCursor(Math.max(0, flat.findIndex((o) => o.value === value)));
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(flat[cursor].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <span id={`${id}-label`} className="mb-1 block text-xs font-bold text-ink">
        {label}
      </span>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-labelledby={`${id}-label ${id}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 text-left text-sm font-medium text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <span className="truncate">{display}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-labelledby={`${id}-label`}
          tabIndex={-1}
          onKeyDown={onListKey}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-lg"
        >
          {sections.map((s) => (
            <div key={s.heading ?? "main"}>
              {s.heading && (
                <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">
                  {s.heading}
                </p>
              )}
              {s.options.map((o) => {
                const selected = o.value === value;
                const hot = flat[cursor]?.value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(o.value)}
                    onMouseEnter={() => setCursor(flat.findIndex((f) => f.value === o.value))}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-accent-soft font-bold text-accent-deep"
                        : hot
                          ? "bg-paper font-medium text-ink"
                          : "font-medium text-ink hover:bg-paper"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
