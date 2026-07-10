import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ContractList } from "@/components/naktal/ContractList";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) redirect("/login");

  // 박상빈님 5/17 명시: 의뢰 시작(createdAt) + 의뢰 시점(contractAt) 둘 다 표시
  // contractAt is null 의뢰 (의뢰 시작했으나 계약 미완료) 도 목록에 표시
  const { data: contracts } = await admin
    .from("BidRequest")
    .select([
      "id,annId,title,orgName,deadline,contractAt,createdAt",
      "recommendedBidPrice,predictedSajungRate",
      "userBidPrice,userRank,userBidRate,userRemark",
      "actualSajungRate,actualFinalPrice,deviationPct,isHit,isWon,winnerName,totalBidders,openingDt",
      "agreedFeeRate,feeStatus,feeAmount",
    ].join(","))
    .eq("userId", dbUser.id as string)
    .order("createdAt", { ascending: false });

  const list = contracts ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 추적</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          총 {list.length}건 · 추적 중인 공고의 개찰 결과를 자동으로 수집해 알려드립니다
        </p>
      </div>

      {list.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
          padding: "56px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 추적 중인 공고가 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>공고 상세에서 [투찰 추적 시작]을 누르면 개찰 결과를 자동으로 알려드려요</div>
          <Link href="/announcements" style={{
            display: "inline-block", background: "#1B3A6B", color: "#fff",
            padding: "10px 24px", borderRadius: 10, textDecoration: "none",
            fontWeight: 600, fontSize: 14,
          }}>공고 목록 보기</Link>
        </div>
      ) : (
        <ContractList items={list as unknown as ContractListItem[]} />
      )}
    </div>
  );
}

export interface ContractListItem {
  id: string;
  annId: string;
  title: string;
  orgName: string;
  deadline: string;
  contractAt: string | null;
  createdAt: string;
  recommendedBidPrice: string | number;
  predictedSajungRate: string | number | null;
  userBidPrice: string | number | null;
  userRank: number | null;
  userBidRate: string | number | null;
  userRemark: string | null;
  actualSajungRate: string | number | null;
  actualFinalPrice: string | number | null;
  deviationPct: string | number | null;
  isHit: boolean | null;
  isWon: boolean | null;
  winnerName: string | null;
  totalBidders: number | null;
  openingDt: string | null;
  feeStatus: string | null;
  feeAmount: string | number | null;
}
