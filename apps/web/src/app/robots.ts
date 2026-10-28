import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";


/** Public pages may be indexed; the signed-in app, Admin and share links may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/login", "/terms", "/privacy"], disallow: ["/admin", "/share/", "/api/", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
