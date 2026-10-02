import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

/**
 * `robots.txt` généré par Next (lot 3, enfant C).
 *
 * Expose tout le site public, ferme les zones privées (`/admin`, `/my-diaba-auto`, `/api`, `/auth`)
 * et pointe le sitemap avec une URL absolue (base `NEXT_PUBLIC_APP_URL`).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/my-diaba-auto", "/api", "/auth"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}