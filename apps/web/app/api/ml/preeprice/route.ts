import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccess, Feature } from "@/lib/plan-guard";
import { buildCacheKey, getCached, setCached } from "@/lib/ml-cache";

interface PreepriceRequestBody {
  category: string;
  budget: number;
  num_bidders_est: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 플랜 접근 제어
  const { data: dbUser } = await supabase
    .from("User")
    .select("plan")
    .eq("supabaseId", user.id)
    .single();

  const plan = (dbUser as { plan: string } | null)?.plan ?? "FREE";
  if (!canAccess(plan as never, Feature.PREEPRICE_ANALYSIS)) {
    return NextResponse.json(
      { error: "PLAN_UPGRADE_REQUIRED" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as PreepriceRequestBody;

  const ML_API_URL = process.env.ML_API_URL;
  const ML_API_KEY = process.env.ML_API_KEY;
  if (!ML_API_URL || !ML_API_KEY) {
    return NextResponse.json({ error: "ML API가 설정되지 않았습니다." }, { status: 503 });
  }

  // 캐시 확인 (24시간)
  const cacheKey = buildCacheKey("preeprice", body as unknown as Record<string, unknown>);
  const cached = await getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached as object, cached: true });
  }

  let result: unknown;
  try {
    const res = await fetch(`${ML_API_URL}/predict/preeprice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ML_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = (await res.json()) as { detail?: string };
      return NextResponse.json(
        { error: err.detail ?? "ML 서버 오류" },
        { status: res.status }
      );
    }

    result = await res.json();
  } catch (err) {
    console.error("[ml/preeprice] ML 서버 호출 실패:", err);
    return NextResponse.json({ error: "ML 서버에 연결할 수 없습니다." }, { status: 503 });
  }

  await setCached("preeprice", cacheKey, result);
  return NextResponse.json({ ...result as object, cached: false });
}
