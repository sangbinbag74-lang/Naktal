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

  const { data: contracts } = await admin
    .from("BidRequest")
    .select([
      "id,annId,title,orgName,deadline,contractAt",
      "recommendedBidPrice,predictedSajungRate",
      "userBidPrice,userRank,userBidRate",
      "actualSajungRate,actualFinalPrice,deviationPct,isHit,isWon,winnerName,totalBidders,openingDt",
      "agreedFeeRate,feeStatus,feeAmount",
    ].join(","))
    .eq("userId", dbUser.id as string)
    .not("contractAt", "is", null)
    .order("contractAt", { ascending: false });

  const list = contracts ?? [];
  // 통계
  const total = list.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = list.filter((c: any) => c.isWon == null).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const won = list.filter((c: any) => c.isWon === true).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lost = list.filter((c: any) => c.isWon === false).length;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 의뢰 내역</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          총 {total}건 · AI 추천 투찰금액을 기반으로 의뢰한 공고 목록입니다
        </p>
      </div>

      {/* 통계 4카드 */}
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

      {/* 리스트 (필터·검색 클라이언트) */}
      {list.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
          padding: "56px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>아직 의뢰한 공고가 없습니다</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>공고 상세 페이지에서 AI 투찰 의뢰를 시작하세요</div>
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
  contractAt: string;
  recommendedBidPrice: string | number;
  predictedSajungRate: string | number | null;
  userBidPrice: string | number | null;
  userRank: number | null;
  userBidRate: string | number | null;
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
