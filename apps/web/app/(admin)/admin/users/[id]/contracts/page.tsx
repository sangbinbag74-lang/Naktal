import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { ContractList } from "@/components/naktal/ContractList";
import type { ContractListItem } from "@/app/(dashboard)/contracts/page";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserContractsPreview({ params }: Props) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: user } = await admin
    .from("User")
    .select("id,bizName,bizNo,ownerName,plan")
    .eq("id", id)
    .maybeSingle();
  if (!user) notFound();

  const { data: contracts } = await admin
    .from("BidRequest")
    .select([
      "id,annId,title,orgName,deadline,contractAt",
      "recommendedBidPrice,predictedSajungRate",
      "userBidPrice,userRank,userBidRate",
      "actualSajungRate,actualFinalPrice,deviationPct,isHit,isWon,winnerName,totalBidders,openingDt",
      "agreedFeeRate,feeStatus,feeAmount",
    ].join(","))
    .eq("userId", id)
    .not("contractAt", "is", null)
    .order("contractAt", { ascending: false });

  const list = (contracts ?? []) as unknown as ContractListItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = user as any;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "#FEF3C7", border: "1px solid #FDE68A",
        padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#92400E",
      }}>
        ⚠️ 어드민 미리보기 — <strong>{u.bizName ?? "미등록"}</strong> ({u.bizNo}) 의 실제 사용자 화면입니다 ·{" "}
        <Link href="/admin/users" style={{ color: "#92400E", textDecoration: "underline" }}>← 사용자 목록</Link>
      </div>

      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>AI 정밀 분석 내역</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          총 {list.length}건 · AI 정밀 분석을 실행한 공고 목록입니다
        </p>
      </div>

      {list.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2", padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
          해당 사용자의 계약 완료 의뢰가 없습니다
        </div>
      ) : (
        <ContractList items={list} />
      )}
    </div>
  );
}
