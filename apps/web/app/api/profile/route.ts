import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchG2BCompanyInfo } from "@/lib/g2b-company";

/**
 * DB User 조회 — 없으면 Supabase Auth 정보로 자동 생성/복구
 * - supabaseId로 찾기
 * - 없으면 bizNo로 찾아서 supabaseId 업데이트 (재가입 케이스)
 * - 없으면 신규 insert
 */
async function getOrCreateDbUserId(
  supabaseId: string,
  authEmail: string,
): Promise<{ id: string; error?: never } | { id: null; error: string }> {
  const admin = createAdminClient();

  // 1) supabaseId로 조회
  const { data: bySupabase } = await admin
    .from("User")
    .select("id")
    .eq("supabaseId", supabaseId)
    .maybeSingle();
  if (bySupabase?.id) return { id: bySupabase.id };

  // 2) 이메일에서 사업자번호 추출 (biz_XXXXXXXXXX@naktal.biz)
  const bizNoMatch = authEmail.match(/^biz_(\d{10})@naktal\.biz$/);
  const bizNo = bizNoMatch?.[1] ?? "";

  // 3) bizNo로 기존 레코드 조회 → supabaseId가 다른 레코드면 업데이트
  if (bizNo) {
    const { data: byBizNo } = await admin
      .from("User")
      .select("id")
      .eq("bizNo", bizNo)
      .maybeSingle();
    if (byBizNo?.id) {
      await admin.from("User").update({ supabaseId }).eq("id", byBizNo.id);
      return { id: byBizNo.id };
    }
  }

  // 4) 없으면 신규 insert — G2B API로 실제 업체명 조회 시도
  let bizName = "";
  let ownerName = "";
  if (bizNo) {
    try {
      const g2b = await fetchG2BCompanyInfo(bizNo);
      if (g2b) { bizName = g2b.bizName; ownerName = g2b.ceoName; }
    } catch { /* G2B 실패 시 빈 값으로 진행 */ }
  }

  const { data: created, error } = await admin
    .from("User")
    .insert({
      id:        crypto.randomUUID(),
      supabaseId,
      bizNo:     bizNo || supabaseId.slice(0, 10),
      bizName,
      ownerName,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[profile] User 자동생성 실패:", error.message, error.code);
    return { id: null, error: `DB 오류(${error.code}): ${error.message}` };
  }
  return { id: created.id };
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getOrCreateDbUserId(user.id, user.email ?? "");
  if (!result.id) return NextResponse.json({});

  const admin = createAdminClient();
  const { data } = await admin
    .from("CompanyProfile")
    .select("*")
    .eq("userId", result.id)
    .maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await getOrCreateDbUserId(user.id, user.email ?? "");
  if (!result.id) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const body = await req.json();
  const admin = createAdminClient();

  // 기존 CompanyProfile id 조회 (없으면 신규 생성용 UUID 발급)
  const { data: existingProfile } = await admin
    .from("CompanyProfile")
    .select("id")
    .eq("userId", result.id)
    .maybeSingle();
  const profileId = existingProfile?.id ?? crypto.randomUUID();

  const { error } = await admin
    .from("CompanyProfile")
    .upsert({ ...body, id: profileId, userId: result.id, updatedAt: new Date().toISOString() }, { onConflict: "userId" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
