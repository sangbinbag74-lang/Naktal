import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from("User")
    .select("id")
    .eq("supabaseId", user.id)
    .single();
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data: recs, error } = await admin
    .from("NumberRecommendation")
    .select("id,annId,category,budgetRange,region,combo1,combo2,combo3,hitRate1,hitRate2,hitRate3,sampleSize,modelVersion,createdAt")
    .eq("userId", dbUser.id)
    .order("createdAt", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[history]", error.message);
    return NextResponse.json({ recommendations: [], total: 0 });
  }

  const annIds = [...new Set((recs ?? []).map((r) => r.annId).filter(Boolean))];
  let annMap: Record<string, { id: string; title: string; orgName: string; budget: string; deadline: string }> = {};
  if (annIds.length > 0) {
    const { data: anns } = await admin
      .from("Announcement")
      .select("id,title,orgName,budget,deadline")
      .in("id", annIds);
    for (const a of anns ?? []) annMap[a.id] = a;
  }

  function fmtBudget(b: string) {
    const n = parseInt(b, 10);
    if (isNaN(n)) return b;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + "억원";
    if (n >= 10000) return (n / 10000).toFixed(0) + "만원";
    return new Intl.NumberFormat("ko-KR").format(n) + "원";
  }

  const enriched = (recs ?? []).map((r) => {
    const ann = r.annId ? annMap[r.annId] : null;
    return {
      id: r.id,
      annId: r.annId,
      annTitle: ann?.title ?? null,
      annOrgName: ann?.orgName ?? null,
      annBudget: ann ? fmtBudget(ann.budget) : null,
      annDeadline: ann?.deadline ?? null,
      category: r.category,
      budgetRange: r.budgetRange,
      region: r.region,
      combo1: r.combo1,
      combo2: r.combo2,
      combo3: r.combo3,
      hitRate1: r.hitRate1,
      hitRate2: r.hitRate2,
      hitRate3: r.hitRate3,
      sampleSize: r.sampleSize,
      modelVersion: r.modelVersion,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ recommendations: enriched, total: enriched.length });
}
