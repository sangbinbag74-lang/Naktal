import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * DELETE /api/analysis/sajung-cache?annId=xxx
 * 해당 공고의 사정율 분석 캐시를 모두 삭제합니다.
 * 삭제 후 다음 조회 시 새로 분석됩니다.
 */
export async function DELETE(req: NextRequest) {
  const annId = req.nextUrl.searchParams.get("annId");
  if (!annId) {
    return NextResponse.json({ error: "annId required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("SajungAnalysisCache")
    .delete()
    .eq("annId", annId);

  if (error) {
    console.error("[sajung-cache DELETE]", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, annId });
}
