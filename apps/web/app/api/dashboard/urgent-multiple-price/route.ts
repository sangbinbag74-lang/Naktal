import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(): Promise<NextResponse> {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("Announcement")
      .select("id,title,orgName,budget,deadline,rawJson")
      .filter("rawJson->>bidMthdNm", "ilike", "%복수예가%")
      .gte("deadline", new Date().toISOString())
      .order("deadline", { ascending: true })
      .limit(3);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch {
    // 실패 시 빈 리스트 반환 (UI는 "마감 임박 복수예가 공고 없음" 표시)
    return NextResponse.json({ data: [] });
  }
}
