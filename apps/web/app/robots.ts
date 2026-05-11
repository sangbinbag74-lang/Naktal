import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const allow = ["/", "/faq", "/privacy", "/terms"];
  const disallow = [
    "/admin", "/admin/*",
    "/api", "/api/*",
    "/dashboard", "/dashboard/*",
    "/announcements", "/announcements/*",
    "/bid-contract", "/bid-contract/*",
    "/bid-result", "/bid-result/*",
    "/contracts", "/folder", "/history",
    "/profile", "/settings", "/alerts",
    "/pricing", "/login", "/signup",
    "/auth", "/auth/*",
  ];
  return {
    rules: [
      { userAgent: "*", allow, disallow, crawlDelay: 1 },
      { userAgent: "Googlebot", allow, disallow },
      { userAgent: "Yeti", allow, disallow },     // 네이버
      { userAgent: "Daumoa", allow, disallow },   // 다음
      { userAgent: "bingbot", allow, disallow },
    ],
    sitemap: "https://naktal.me/sitemap.xml",
    host: "https://naktal.me",
  };
}
