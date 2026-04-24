import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  try {
    const { data: dbUser } = await admin
      .from("User")
      .select("id")
      .eq("supabaseId", user.id)
      .maybeSingle();
    if (!dbUser) return NextResponse.json({ hasProfile: false });

    const { data: profile } = await admin
      .from("CompanyProfile")
      .select("id,bizName,mainCategory,constructionRecords,creditScore")
      .eq("userId", dbUser.id)
      .maybeSingle();

    if (!profile) return NextResponse.json({ hasProfile: false });

    const records = Array.isArray(profile.constructionRecords) ? profile.constructionRecords : [];

    return NextResponse.json({
      hasProfile: true,
      bizName: profile.bizName ?? "",
      mainCategory: profile.mainCategory ?? "",
      recordCount: records.length,
      creditScore: profile.creditScore ?? "",
    });
  } catch {
    // 조회 실패 시 프로필 미등록 동일 응답 — UI는 프로필 등록 안내 표시
    return NextResponse.json({ hasProfile: false });
  }
}
