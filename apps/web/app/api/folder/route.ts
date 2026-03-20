import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// GET /api/folder?ids=id1,id2,...  → 저장된 공고 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = request.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({ data: [] });

  const idList = ids.split(",").filter(Boolean).slice(0, 100);
  if (idList.length === 0) return NextResponse.json({ data: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("Announcement")
    .select("id,konepsId,title,orgName,budget,deadline,category,region,createdAt")
    .in("id", idList);

  if (error) {
    console.error("[GET /api/folder]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
