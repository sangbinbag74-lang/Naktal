import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const body = await request.json();

  // 허용 필드만 추출 (화이트리스트)
  const allowed = [
    "userBidPrice", "userFollowedRecommendation",
    "openingDt", "isWon", "winnerName", "actualFinalPrice", "totalBidders",
    "feeAmount", "feeStatus", "memo",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "변경 필드 없음" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("BidRequest").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
