// 박상빈님 5/20 — 독립 /strategy 페이지 삭제됨 (CLAUDE.md 명시).
// 허용 진입점: /announcements/[id] 공고 상세 + /folder 카드.
// 직접 접근 시 /folder 로 리디렉트 (middleware + dashboard layout 가드는 자동).
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StrategyIndexPage(): never {
  redirect("/folder");
}
