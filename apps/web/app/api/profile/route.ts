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
  let { data } = await admin
    .from("CompanyProfile")
    .select("*")
    .eq("userId", result.id)
    .maybeSingle();

  // 자기복구 (2026-07-09): 가입 시 CompanyProfile 자동생성이 조용히 실패한 계정 —
  //  조회 시점에 없으면 즉석에서 G2B 조회해 생성 (대시보드 추천·적격심사 "내 업체 안 나옴" 해결)
  if (!data) {
    const { data: dbUser } = await admin.from("User").select("bizNo,bizName,ownerName").eq("id", result.id).single();
    const bizNo = dbUser?.bizNo ?? "";
    if (/^\d{10}$/.test(bizNo)) {
      try {
        const g2b = await fetchG2BCompanyInfo(bizNo);
        if (g2b) {
          const healed = {
            id: crypto.randomUUID(),
            userId: result.id,
            bizNo,
            bizName: g2b.bizName || dbUser?.bizName || "",
            ceoName: g2b.ceoName || dbUser?.ownerName || "",
            address: g2b.address,
            establishedAt: g2b.establishedAt,
            employeeCount: g2b.employeeCount,
            licenses: g2b.licenses,
            mainCategory: g2b.licenses.find((l) => l.isMain)?.licenseType ?? "",
            subCategories: g2b.licenses.filter((l) => !l.isMain).map((l) => l.licenseType),
            updatedAt: new Date().toISOString(),
          };
          const { error: healErr } = await admin.from("CompanyProfile").upsert(healed, { onConflict: "userId" });
          if (!healErr) data = healed as unknown as typeof data;
          else console.error("[profile] 자기복구 upsert 실패:", healErr.message);
        }
      } catch (e) {
        console.error("[profile] 자기복구 G2B 조회 실패:", e);
      }
    }
  }
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
    .select("id, bizNo, bizName, ceoName")
    .eq("userId", result.id)
    .maybeSingle();
  const profileId = existingProfile?.id ?? crypto.randomUUID();

  // 사업자번호 잠금 — 한 번 등록된 row 의 bizNo / bizName / ceoName 변경 차단
  // 다시 불러오기 (G2B import) 후 저장 시에는 G2B 응답이 동일 bizNo 라 일치 → 통과
  const exist = existingProfile as { bizNo?: string; bizName?: string; ceoName?: string } | null;
  if (exist?.bizNo && exist.bizNo.length === 10) {
    if (body.bizNo && body.bizNo !== exist.bizNo) {
      return NextResponse.json({
        error: "BIZNO_LOCKED",
        message: "사업자번호는 변경할 수 없습니다. 다시 불러오기로만 갱신 가능합니다.",
      }, { status: 400 });
    }
    // 입력 안 해도 되도록 기존 값 유지
    body.bizNo = exist.bizNo;
  }

  const { error } = await admin
    .from("CompanyProfile")
    .upsert({ ...body, id: profileId, userId: result.id, updatedAt: new Date().toISOString() }, { onConflict: "userId" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
