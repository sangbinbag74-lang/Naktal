import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://naktal.me";
  const now = new Date();
  return [
    { url: base,            lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/refund`,  lastModified: now, changeFrequency: "yearly",  priority: 0.6 },
    { url: `${base}/faq`,    lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/terms`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
