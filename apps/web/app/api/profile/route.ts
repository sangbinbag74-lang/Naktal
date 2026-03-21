import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * DB User 조회 — 없으면 Supabase Auth 정보로 자동 생성
 * 회원가입 시 create-user 호출 실패(이메일 인증 대기 등) 엣지케이스 대응
 */
async function getOrCreateDbUserId(supabaseId: string, authEmail: string): Promise<string | null> {
  const admin = createAdminClient();

  // 1) 기존 레코드 조회
  const { data: existing } = await admin
    .from("User")
    .select("id")
    .eq("supabaseId", supabaseId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // 2) 없으면 자동 생성: 이메일에서 사업자번호 추출 (biz_XXXXXXXXXX@naktal.biz)
  const bizNoMatch = authEmail.match(/^biz_(\d{10})@naktal\.biz$/);
  const bizNo = bizNoMatch?.[1] ?? "";

  const { data: created, error } = await admin
    .from("User")
    .insert({
      supabaseId,
      bizNo,
      bizName:   bizNo ? `업체(${bizNo})` : "미등록",
      ownerName: "미등록",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[profile] User 자동생성 실패:", error.message);
    return null;
  }
  return created?.id ?? null;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getOrCreateDbUserId(user.id, user.email ?? "");
  if (!userId) return NextResponse.json({});

  const admin = createAdminClient();
  const { data } = await admin.from("CompanyProfile").select("*").eq("userId", userId).maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getOrCreateDbUserId(user.id, user.email ?? "");
  if (!userId) return NextResponse.json({ error: "User 생성 실패. 다시 시도해주세요." }, { status: 500 });

  const body = await req.json();

  const admin = createAdminClient();
  const { error } = await admin.from("CompanyProfile").upsert(
    { ...body, userId },
    { onConflict: "userId" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
