import React from "react";
import Link from "next/link";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Tombol yang sekaligus tautan.
 *
 * <a href="/katalog"><Button>Katalog</Button></a> tidak valid: <a> dan
 * <button> dua-duanya elemen interaktif, dan menumpuknya merusak perilaku
 * keyboard serta screen reader. HTML hanya mengizinkan satu elemen
 * interaktif di dalam elemen interaktif.
 *
 * Button sudah mendeklarasikan asChild di tipenya tapi tidak pernah
 * memakainya, jadi selalu menghasilkan <button>. Karena components/ui/
 * milik shadcn dan tidak boleh diubah langsung, pola tombol-tautan ini
 * memakai buttonVariants yang memang sudah di-export dari sana.
 */

type ButtonLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className"
> & {
  /* Boleh undefined karena beberapa CTA dituju dari data toko yang bisa
     kosong, misalnya maps_url. Tanpa href, <a> tetap tampil seperti tombol
     tapi tidak bisa difokus keyboard dan tidak jadi tautan, jadi lebih baik
     tidak dirender sama sekali daripada menampilkan CTA mati. */
  href?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
};

/* Tautan internal memakai <Link> Next.js supaya navigasi client-side tetap
   jalan. Sisanya (wa.me, tel:, http, dan #hash) tetap <a> biasa. */
function isInternalRoute(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  if (!href) return null;

  const classes = cn(buttonVariants({ variant, size }), className);

  if (isInternalRoute(href)) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={classes} {...rest}>
      {children}
    </a>
  );
}
