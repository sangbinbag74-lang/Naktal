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
  const total = list.length;
  const pending = list.filter((c) => c.isWon == null).length;
  const won = list.filter((c) => c.isWon === true).length;
  const lost = list.filter((c) => c.isWon === false).length;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{
        background: "#FEF3C7", border: "1px solid #FDE68A",
        padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "#92400E",
      }}>
        ⚠️ 어드민 미리보기 — <strong>{u.bizName ?? "미등록"}</strong> ({u.bizNo}) 의 실제 사용자 화면입니다 ·{" "}
        <Link href="/admin/users" style={{ color: "#92400E", textDecoration: "underline" }}>← 사용자 목록</Link>
      </div>

      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 의뢰 내역</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          총 {total}건 · AI 추천 투찰금액을 기반으로 의뢰한 공고 목록입니다
        </p>
      </div>

      {/* 통계 4카드 (사용자 화면과 동일) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "총 의뢰", value: total + "건", color: "#1B3A6B" },
          { label: "개찰 대기", value: pending + "건", color: pending > 0 ? "#60A5FA" : "#9CA3AF" },
          { label: "낙찰 성공", value: won + "건", color: won > 0 ? "#059669" : "#9CA3AF" },
          { label: "낙찰률", value: winRate != null ? winRate + "%" : "-", color: winRate != null && winRate >= 30 ? "#059669" : winRate != null && winRate >= 15 ? "#D97706" : "#9CA3AF" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
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
