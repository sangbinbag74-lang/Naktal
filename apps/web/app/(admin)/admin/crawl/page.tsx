// 사이드바에서 제거된 페이지 — /admin 으로 리다이렉트
import { redirect } from "next/navigation";

export default function CrawlPageDeprecated(): never {
  redirect("/admin");
}
