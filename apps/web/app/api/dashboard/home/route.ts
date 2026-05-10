import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface BidReqRow {
  id: string;
  annId: string;
  title: string;
  orgName: string;
  deadline: string;
  recommendedBidPrice: string | number | null;
  predictedSajungRate: number | null;
  contractAt: string | null;
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
}
interface BppRow {
  annId: string;
  predictedSajungRate: number | null;
  optimalBidPrice: string | null;
  winProbability: number | null;
}
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from("User")
    .select("id,plan")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const userId = (dbUser as { id: string; plan: string }).id;
  const plan = (dbUser as { id: string; plan: string }).plan;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const d3later = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1. 진행중 내 의뢰 (BidRequest, 마감 안 된)
  const { data: myReqsRaw } = await admin
    .from("BidRequest")
    .select("id,annId,title,orgName,deadline,recommendedBidPrice,predictedSajungRate,contractAt,konepsId")
    .eq("userId", userId)
    .is("cancelledAt", null)
    .gt("deadline", now.toISOString())
    .order("deadline", { ascending: true })
    .limit(5);
  const myRequests = (myReqsRaw ?? []) as (BidReqRow & { konepsId?: string })[];

  // 2. 사용자 업체 정보 (CompanyProfile)
  const { data: profile, error: profileErr } = await admin
    .from("CompanyProfile")
    .select("id,mainCategory,subCategories,regions")
    .eq("userId", userId)
    .maybeSingle();
  if (profileErr) console.error("[dashboard.home] CompanyProfile select error:", profileErr);
  const myCats = profile?.subCategories ?? (profile?.mainCategory ? [profile.mainCategory] : []);
  const myRegions = profile?.regions ?? [];
  // row 가 존재하면 등록된 것으로 간주 (mainCategory/subCategories/regions 비어 있어도 row 있으면 OK)
  const profileSet = !!profile?.id;

  // 3. AI 추천 공고 (활성 + 사용자 매칭, 없으면 mostRecent)
  let recommendedQuery = admin
    .from("AnnouncementActive")
    .select("id,konepsId,title,orgName,category,region,budget,deadline")
    .gt("deadline", now.toISOString())
    .order("deadline", { ascending: true })
    .limit(10);

  if (Array.isArray(myCats) && myCats.length > 0) {
    // 활성 공고 중 사용자 업종 매칭
    recommendedQuery = recommendedQuery.in("category", myCats as string[]);
  }
  if (Array.isArray(myRegions) && myRegions.length > 0) {
    recommendedQuery = recommendedQuery.in("region", myRegions as string[]);
  }
  const { data: recommendedAnns } = await recommendedQuery;
  const recommended = (recommendedAnns ?? []) as AnnRow[];

  // 추천 공고의 BidPricePrediction 조회 (예측 사정율·추천 투찰가)
  const recAnnIds = recommended.map((a) => a.id);
  const { data: bppRaw } = recAnnIds.length > 0
    ? await admin
        .from("BidPricePrediction")
        .select("annId,predictedSajungRate,optimalBidPrice,winProbability")
        .in("annId", recAnnIds)
        .gt("expiresAt", now.toISOString())
    : { data: [] };
  const bppMap = new Map<string, BppRow>(((bppRaw ?? []) as BppRow[]).map((b) => [b.annId, b]));

  // 4. 마감 임박 D-3 (활성)
  const { data: urgentRaw } = await admin
    .from("AnnouncementActive")
    .select("id,konepsId,title,orgName,category,budget,deadline")
    .gt("deadline", now.toISOString())
    .lt("deadline", d3later)
    .order("deadline", { ascending: true })
    .limit(8);
  const urgent = (urgentRaw ?? []) as AnnRow[];

  // 5. 이번 달 지표 (BidRequest count + AnnouncementActive count)
  const [thisMonthReqRes, totalActiveRes, todayNewRes] = await Promise.all([
    admin.from("BidRequest")
      .select("id", { count: "exact", head: true })
      .eq("userId", userId)
      .is("cancelledAt", null)
      .gte("createdAt", monthStart),
    admin.from("AnnouncementActive")
      .select("id", { count: "exact", head: true }),
    admin.from("AnnouncementActive")
      .select("id", { count: "exact", head: true })
      .gte("createdAt", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),
  ]);

  return NextResponse.json({
    myRequests: myRequests.map((r) => ({
      id: r.id,
      annId: r.annId,
      konepsId: r.konepsId ?? r.annId,
      title: r.title,
      orgName: r.orgName,
      deadline: r.deadline,
      recommendedBidPrice: Number(r.recommendedBidPrice ?? 0),
      predictedSajungRate: r.predictedSajungRate,
      contractAt: r.contractAt,
    })),
    recommended: recommended.map((a) => {
      const bpp = bppMap.get(a.id);
      return {
        id: a.id,
        konepsId: a.konepsId,
        title: a.title,
        orgName: a.orgName,
        category: a.category,
        region: a.region,
        budget: Number(a.budget),
        deadline: a.deadline,
        predictedSajungRate: bpp?.predictedSajungRate ?? null,
        optimalBidPrice: bpp?.optimalBidPrice ? Number(bpp.optimalBidPrice) : null,
        winProbability: bpp?.winProbability ?? null,
      };
    }),
    urgent: urgent.map((a) => ({
      id: a.id,
      konepsId: a.konepsId,
      title: a.title,
      orgName: a.orgName,
      category: a.category,
      budget: Number(a.budget),
      deadline: a.deadline,
    })),
    metrics: {
      myRequestsThisMonth: thisMonthReqRes.count ?? 0,
      totalActive: totalActiveRes.count ?? 0,
      todayNew: todayNewRes.count ?? 0,
      plan,
    },
    profileSet,
  });
}
