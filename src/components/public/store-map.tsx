import React from "react";

/* Satu-satunya sumber peta toko: URL embed resmi dari Google Maps
   (Share > Embed) sehingga pin jatuh persis di tempat usaha,
   bukan hasil kueri teks yang bisa meleset. */
const EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.205050029677!2d106.67981999999999!3d-6.2366814999999995!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69fa339a58131f%3A0xfc71c2a2509f322e!2sat%20cell!5e0!3m2!1sen!2sid";

export function StoreMap({ title }: { title: string }) {
  return (
    <iframe
      title={title}
      width="100%"
      height="100%"
      className="h-72 w-full border-0 lg:h-full lg:min-h-80"
      loading="lazy"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      src={EMBED_SRC}
    />
  );
}
