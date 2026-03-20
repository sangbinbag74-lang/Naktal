import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { annId?: string };

  // CompanyProfile 존재 여부 확인
  const { data: profile } = await supabase
    .from("CompanyProfile")
    .select("id,mainCategory,constructionRecords")
    .eq("userId", user.id)
    .maybeSingle();

  // Mock 응답 (B안 Step 2에서 실제 로직 구현)
  if (!profile) {
    return NextResponse.json({
      result: "UNCERTAIN",
      reason: "업체 정보가 등록되지 않았습니다. 프로필을 등록하면 더 정확한 판정이 가능합니다.",
    });
  }

  // 임시: 공고번호가 있으면 PASS, 없으면 UNCERTAIN
  if (body.annId) {
    return NextResponse.json({
      result: "PASS",
      reason: "등록된 업체 실적 기준으로 적격심사 통과 가능성이 높습니다.",
      requiredRecord: "2억원 이상",
      myRecord: "3억 5천만원",
    });
  }

  return NextResponse.json({
    result: "UNCERTAIN",
    reason: "공고 정보를 입력하면 더 정확한 판정이 가능합니다.",
  });
}
