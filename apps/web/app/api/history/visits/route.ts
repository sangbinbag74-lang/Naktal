import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// GET: 내 방문 이력 조회
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("AnnouncementVisit")
    .select("annDbId,annId,title,orgName,budget,deadline,category,region,isClosed,multiplePrice,optimalBidPrice,predictedSajungRate,sampleSize,visitedAt")
    .eq("userId", user.id)
    .order("visitedAt", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ visits: data ?? [] });
}

// POST: 방문 기록 upsert
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    annDbId: string;
    annId: string;
    title: string;
    orgName: string;
    budget: number;
    deadline: string;
    category: string;
    region: string;
    isClosed: boolean;
    multiplePrice: boolean;
    optimalBidPrice?: number | null;
    predictedSajungRate?: number | null;
    sampleSize?: number | null;
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("AnnouncementVisit")
    .upsert(
      {
        userId: user.id,
        annDbId: body.annDbId,
        annId: body.annId,
        title: body.title,
        orgName: body.orgName,
        budget: body.budget,
        deadline: body.deadline,
        category: body.category,
        region: body.region,
        isClosed: body.isClosed,
        multiplePrice: body.multiplePrice,
        optimalBidPrice: body.optimalBidPrice ?? null,
        predictedSajungRate: body.predictedSajungRate ?? null,
        sampleSize: body.sampleSize ?? null,
        visitedAt: new Date().toISOString(),
      },
      { onConflict: "userId,annId" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
