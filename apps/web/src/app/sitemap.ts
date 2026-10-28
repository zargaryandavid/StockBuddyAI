import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";


/** The pages anyone can open: sign-in (the front door), Terms and Privacy. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/login`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
