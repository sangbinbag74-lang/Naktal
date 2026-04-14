import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmtPrice(n: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
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
    .select("id,annId,title,orgName,deadline,recommendedBidPrice,agreedFeeRate,agreedFeeAmount,contractAt")
    .eq("userId", dbUser.id as string)
    .not("contractAt", "is", null)
    .order("contractAt", { ascending: false });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 20 }}>계약 서류</div>

      {!contracts || contracts.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
          padding: "48px 24px", textAlign: "center", color: "#94A3B8", fontSize: 14,
        }}>
          아직 계약된 서류가 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {contracts.map((c) => (
            <div key={c.id as string} style={{
              background: "#fff", borderRadius: 14, border: "1px solid #E8ECF2",
              padding: "18px 20px",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
                {c.title as string}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
                {c.orgName as string} · 마감 {fmtDate(c.deadline as string)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {[
                  { label: "AI 추천 투찰금액", value: fmtPrice(Number(c.recommendedBidPrice ?? 0)) },
                  { label: `수수료 (낙찰 시 ${(Number(c.agreedFeeRate ?? 0) * 100).toFixed(1)}%)`, value: fmtPrice(Number(c.agreedFeeAmount ?? 0)) },
                  { label: "계약일", value: fmtDate(c.contractAt as string) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{value}</span>
                  </div>
                ))}
              </div>
              <Link
                href={`/bid-result/${c.annId}`}
                style={{
                  display: "block", textAlign: "center",
                  padding: "10px", background: "#1B3A6B", color: "#fff",
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                결과 보기
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
