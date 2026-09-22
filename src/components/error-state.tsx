import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WA_NUMBER = "6285775398389";

type ErrorStateProps = {
  code: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  imageCaption: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string }[];
  waText: string;
  helpText: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  langNote?: React.ReactNode;
};

/**
 * Hero error bersama untuk 404 dan 500. Satu kolom konten di kiri,
 * kartu foto + bantuan WA di kanan. Sengaja tanpa eyebrow dan tanpa
 * label bernomor, mengikuti aturan UI AtCell.
 */
export function ErrorState({
  code,
  title,
  description,
  image,
  imageAlt,
  imageCaption,
  primary,
  secondary,
  waText,
  helpText,
  actions,
  meta,
  langNote,
}: ErrorStateProps) {
  const waHref = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="rise grid items-center gap-10 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="stamp-imei" role="status" aria-label={`Kode error ${code}`}>
            ERR {code}
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-muted">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {actions ?? (
              <Link
                href={primary.href}
                className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-7 text-[15px] font-bold text-white shadow-sm transition-all duration-200 hover:bg-accent-deep active:scale-[0.98]"
              >
                {primary.label}
              </Link>
            )}
            {secondary.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-card px-5 text-[15px] font-bold text-ink shadow-sm transition-all duration-200 hover:border-accent hover:text-accent-deep active:scale-[0.98]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {meta ? <div className="mt-5">{meta}</div> : null}
          {langNote ? (
            <p className="mt-5 text-sm leading-relaxed text-muted">{langNote}</p>
          ) : null}
        </div>

        <div className="md:col-span-5">
          <Card className="overflow-hidden">
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              width={800}
              height={600}
              className="aspect-[4/3] w-full object-cover"
            />
            <p className="border-t border-line px-5 py-3 text-[13px] leading-relaxed text-muted">
              {imageCaption}
            </p>
          </Card>

          <div className="mt-3 rounded-xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <p className="text-sm font-bold text-ink">Butuh jawaban cepat?</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{helpText}</p>
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg",
                "bg-wa px-4 text-sm font-bold text-white shadow-sm",
                "transition-all duration-200 hover:bg-wa-deep active:scale-[0.98]"
              )}
            >
              <MessageCircle className="h-4 w-4" />
              Chat WA toko
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
