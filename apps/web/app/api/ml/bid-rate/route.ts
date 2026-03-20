import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCacheKey, getCached, setCached } from "@/lib/ml-cache";

interface BidRateRequestBody {
  budget: number;
  category: string;
  region: string;
  org_name: string;
  num_bidders?: number;
  deadline: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as BidRateRequestBody;

  const ML_API_URL = process.env.ML_API_URL;
  const ML_API_KEY = process.env.ML_API_KEY;
  if (!ML_API_URL || !ML_API_KEY) {
    return NextResponse.json({ error: "ML API가 설정되지 않았습니다." }, { status: 503 });
  }

  // 캐시 확인 (24시간)
  const cacheKey = buildCacheKey("bid-rate", body as unknown as Record<string, unknown>);
  const cached = await getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached as object, cached: true });
  }

  // ML 서버 호출
  let result: unknown;
  try {
    const res = await fetch(`${ML_API_URL}/predict/bid-rate`, {
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
    console.error("[ml/bid-rate] ML 서버 호출 실패:", err);
    return NextResponse.json({ error: "ML 서버에 연결할 수 없습니다." }, { status: 503 });
  }

  // 캐시 저장
  await setCached("bid-rate", cacheKey, result);

  return NextResponse.json({ ...result as object, cached: false });
}
