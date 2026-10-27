import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

/** The origin (scheme, host, port) of a configured URL, for the policy below. */
function origin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// What the browser may load. The app talks only to its own API and Supabase, shows
// article pictures from Supabase Storage and Library book covers (Open Library, which
// redirects many covers to archive.org, or an admin's cover link from Amazon or Google Books;
// keep in step with COVER_HOSTS in apps/api/src/stockbuddy/books.py), and may never be
// framed by another site.
const bookCovers = [
  "https://covers.openlibrary.org",
  "https://archive.org",
  "https://*.archive.org",
  "https://m.media-amazon.com",
  "https://images-na.ssl-images-amazon.com",
  "https://images-eu.ssl-images-amazon.com",
  "https://books.google.com",
  "https://books.googleusercontent.com",
].join(" ");
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${origin(supabaseUrl)} ${bookCovers}`,
  "font-src 'self'",
  `connect-src 'self' ${origin(apiUrl)} ${origin(supabaseUrl)} ${origin(supabaseUrl).replace(/^http/, "ws")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // A second local dev server (the local-Supabase preview) needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
