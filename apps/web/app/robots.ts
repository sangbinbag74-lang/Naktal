import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/terms", "/privacy"],
        disallow: ["/admin", "/api", "/dashboard", "/strategy", "/qualification", "/realtime", "/profile", "/alerts"],
      },
    ],
    sitemap: "https://naktal.me/sitemap.xml",
  };
}
