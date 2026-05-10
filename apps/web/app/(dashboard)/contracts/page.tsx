import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ContractRow } from "@/components/naktal/ContractRow";

export const dynamic = "force-dynamic";

function fmtPrice(n: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function getDDay(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return { label: "마감", bg: "#F1F5F9", color: "#94A3B8" };
  if (diff <= 2) return { label: `D-${diff}`, bg: "#FEF2F2", color: "#DC2626" };
  if (diff <= 5) return { label: `D-${diff}`, bg: "#FFF7ED", color: "#C2410C" };
  if (diff <= 10) return { label: `D-${diff}`, bg: "#EFF6FF", color: "#1E40AF" };
  return { label: `D-${diff}`, bg: "#F1F5F9", color: "#475569" };
}

function WonBadge({ isWon }: { isWon: boolean | null }) {
  if (isWon === true) return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "3px 10px", borderRadius: 5, border: "1px solid #86EFAC" }}>
      ✅ 낙찰 (1순위)
    </span>
  );
  if (isWon === false) return (
    <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", background: "#F1F5F9", padding: "3px 10px", borderRadius: 5 }}>
      미낙찰
    </span>
  );
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: "#60A5FA", background: "#EFF6FF", padding: "3px 10px", borderRadius: 5 }}>
      결과 확인 중
    </span>
  );
}

export default async function ContractsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("id").eq("supabaseId", user.id).single();
  if (!dbUser) redirect("/login");

  const { data: contracts } = await admin
    .from("BidRequest")
    .select("id,annId,title,orgName,deadline,recommendedBidPrice,agreedFeeRate,contractAt,isWon,feeStatus")
    .eq("userId", dbUser.id as string)
    .not("contractAt", "is", null)
    .order("contractAt", { ascending: false });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>투찰 의뢰 내역</h2>
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
          총 {contracts?.length ?? 0}건 · AI 추천 투찰금액을 기반으로 의뢰한 공고 목록입니다
        </p>
      </div>

      {/* 리스트 */}
      {!contracts || contracts.length === 0 ? (
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {contracts.map((c) => (
            <ContractRow
              key={c.id as string}
              annId={c.annId as string}
              title={c.title as string}
              orgName={c.orgName as string}
              contractAt={c.contractAt as string}
              recommendedBidPrice={Number(c.recommendedBidPrice ?? 0)}
              deadline={c.deadline as string}
              isWon={c.isWon as boolean | null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
