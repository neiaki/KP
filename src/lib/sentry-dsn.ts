/*
 * DSN Sentry yang sah berbentuk https://<public key>@<host>/<project id>,
 * misalnya https://abc123@o451234.ingest.sentry.io/451234.
 *
 * Nilai yang sering tertukar dengan DSN adalah auth token (`sntryu_...`) atau
 * URL dashboard. Kalau nilai seperti itu diteruskan ke Sentry.init(), SDK
 * mencetak "Invalid Sentry Dsn" saat proses start dan setiap kali bundle
 * client dimuat. Pemeriksaan di sini membuat salah isi env hanya mematikan
 * Sentry, sama seperti DSN kosong, tanpa mengotori log.
 *
 * Fungsi ini murni dan tidak mengimpor SDK, jadi aman dipakai di server
 * (src/instrumentation.ts) maupun browser (src/instrumentation-client.ts).
 */
export function isSentryDsn(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username.length > 0 &&
      /\/\d+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
