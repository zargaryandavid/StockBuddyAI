/**
 * The public address links, previews and the sitemap point to. Set NEXT_PUBLIC_SITE_URL to
 * https://myportfoliobuddy.com once the domain is connected; until then Vercel's production
 * address is used.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
