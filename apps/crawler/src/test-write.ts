import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  console.log("1. BidResult 조회 테스트...");
  const { data, error: e1 } = await supabase.from("BidResult").select("id,annId").limit(1);
  console.log("조회:", data, e1?.message);

  console.log("2. BidResult 단건 upsert 테스트...");
  const { error: e2 } = await supabase.from("BidResult").upsert({
    id: "00000000-0000-4000-8000-000000000001",
    annId: "TEST_ANN_001",
    bidRate: 99.5,
    finalPrice: "100000000",
    numBidders: 5,
    winnerName: "테스트업체",
  }, { onConflict: "annId" });
  console.log("upsert 결과:", e2 ? `에러: ${e2.message}` : "성공");

  if (!e2) {
    const { error: e3 } = await supabase.from("BidResult").delete().eq("annId", "TEST_ANN_001");
    console.log("cleanup:", e3 ? `에러: ${e3.message}` : "삭제 성공");
  }
}

main().catch(console.error);
