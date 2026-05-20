// /bid-result/[annId] 동적 라우트만 사용 — 인덱스 접근 시 /folder 리디렉트
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BidResultIndexPage(): never {
  redirect("/folder");
}
