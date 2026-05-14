import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface BppRow {
  annId: string;
  predictedSajungRate: number | null;
  optimalBidPrice: string | null;
  lowerLimitPrice: string | null;
  winProbability: number | null;
  sampleSize: number | null;
  createdAt: string;
}
interface AnnRow {
  id: string;
  konepsId: string;
  title: string;
  orgName: string;
  category: string;
  region: string;
  budget: string;
  deadline: string;
  bsisAmt: string;
}
interface BidResultRow {
  annId: string;
  bidRate: string;
  finalPrice: string;
  numBidders: number | null;
  winnerName: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 인증
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin.from("User").select("isAdmin").eq("supabaseId", user.id).single();
  if (!dbUser?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = req.nextUrl;
  const status = url.searchParams.get("status") ?? "active"; // active | closed
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const now = new Date().toISOString();

  // 1. 공고 조회 (활성 또는 최근 마감)
  let annQuery;
  if (status === "active") {
    annQuery = admin
      .from("Announcement")
      .select("id,konepsId,title,orgName,category,region,budget,deadline,bsisAmt")
      .gt("deadline", new Date().toISOString())
      .order("deadline", { ascending: true });
  } else {
    // 최근 30일 마감
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    annQuery = admin
      .from("Announcement")
      .select("id,konepsId,title,orgName,category,region,budget,deadline,bsisAmt")
      .lt("deadline", now)
      .gt("deadline", since)
      .order("deadline", { ascending: false });
  }
  const { data: anns } = await annQuery.limit(limit);
  if (!anns || anns.length === 0) return NextResponse.json({ data: [] });

  const annIds = (anns as AnnRow[]).map((a) => a.id);

  // 2. BidPricePrediction 조회
  const { data: bpps } = await admin
    .from("BidPricePrediction")
    .select("annId,predictedSajungRate,optimalBidPrice,lowerLimitPrice,winProbability,sampleSize,createdAt")
    .in("annId", annIds);
  const bppMap = new Map<string, BppRow>(
    ((bpps ?? []) as BppRow[]).map((b) => [b.annId, b])
  );

  // 3. BidResult 조회 (마감된 공고만)
  const { data: results } = await admin
    .from("BidResult")
    .select("annId,bidRate,finalPrice,numBidders,winnerName")
    .in("annId", annIds);
  const resultMap = new Map<string, BidResultRow>(
    ((results ?? []) as BidResultRow[]).map((r) => [r.annId, r])
  );

  // 4. 합병
  const data = (anns as AnnRow[]).map((a) => {
    const pred = bppMap.get(a.id);
    const result = resultMap.get(a.id);

    const predOptimalBid = pred?.optimalBidPrice ? Number(pred.optimalBidPrice) : null;
    const predRate = pred?.predictedSajungRate ?? null;
    const actualRate = result ? Number(result.bidRate) : null;
    const actualFinalPrice = result ? Number(result.finalPrice) : null;
    const deviation = predRate != null && actualRate != null ? actualRate - predRate : null;

    return {
      annId: a.id,
      konepsId: a.konepsId,
      title: a.title,
      orgName: a.orgName,
      category: a.category,
      region: a.region,
      budget: Number(a.budget),
      bsisAmt: Number(a.bsisAmt),
      deadline: a.deadline,
      // AI 예측
      predictedSajungRate: predRate,
      predOptimalBid,
      predLowerLimit: pred?.lowerLimitPrice ? Number(pred.lowerLimitPrice) : null,
      winProbability: pred?.winProbability ?? null,
      sampleSize: pred?.sampleSize ?? null,
      predCreatedAt: pred?.createdAt ?? null,
      // 실제 결과
      actualBidRate: actualRate,
      actualFinalPrice,
      numBidders: result?.numBidders ?? null,
      winnerName: result?.winnerName ?? null,
      // 편차
      deviation, // %p
    };
  });

  return NextResponse.json({ data, total: data.length });
}
