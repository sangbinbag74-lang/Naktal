// /bid-request 직접 접근 — 의뢰는 공고 상세에서 시작 → /folder 리디렉트
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BidRequestIndexPage(): never {
  redirect("/folder");
}
