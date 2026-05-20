import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchG2BCompanyInfo } from "@/lib/g2b-company";
import { isCeoMatch } from "@/lib/biz-name-match";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 세션 확인은 anon 클라이언트로
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: {
    bizNo: string;
    bizName: string;
    ownerName: string;
    notifyEmail?: string | null;
    notifyPhone?: string | null;
    address?: string | null;
    marketingConsent?: boolean;
    kakaoId?: string;
    kakaoVerifiedName?: string;
    kakaoVerifiedPhone?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 박상빈님 5/20 명시 — 클라이언트 검증 우회 차단을 위한 서버 측 재검증
  const bizNoClean = (body.bizNo ?? "").replace(/\D/g, "");
  if (bizNoClean.length !== 10) {
    return NextResponse.json({ ok: false, error: "사업자번호 형식 오류" }, { status: 400 });
  }
  const ownerNameClean = (body.ownerName ?? "").trim();
  if (!ownerNameClean) {
    return NextResponse.json({ ok: false, error: "대표자명 누락" }, { status: 400 });
  }
  // G2B 사업자등록증 재대조 (클라이언트가 lookup-biz 우회한 경우 차단)
  const g2bVerify = await fetchG2BCompanyInfo(bizNoClean);
  if (!g2bVerify) {
    return NextResponse.json({ ok: false, error: "나라장터 미등록 업체" }, { status: 400 });
  }
  if (g2bVerify.ceoName && !isCeoMatch(ownerNameClean, g2bVerify.ceoName)) {
    return NextResponse.json(
      { ok: false, error: `대표자명 불일치 (입력 ${ownerNameClean} / 등록 ${g2bVerify.ceoName})` },
      { status: 400 },
    );
  }
  body.bizNo = bizNoClean;
  body.ownerName = ownerNameClean;

  // RLS 우회: service_role로 User 테이블 upsert
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRow: any = {
    id:                crypto.randomUUID(),
    supabaseId:        user.id,
    bizNo:             body.bizNo,
    bizName:           body.bizName,
    ownerName:         body.ownerName,
    notifyEmail:       body.notifyEmail ?? null,
    notifyPhone:       body.notifyPhone ?? null,
    address:           body.address ?? null,
    marketingConsent:  body.marketingConsent === true,
    marketingConsentAt: body.marketingConsent === true ? new Date().toISOString() : null,
  };
  if (body.kakaoId) {
    userRow.kakaoId = body.kakaoId;
    userRow.kakaoVerifiedName = body.kakaoVerifiedName ?? null;
    userRow.kakaoVerifiedPhone = body.kakaoVerifiedPhone ?? null;
    userRow.kakaoVerifiedAt = new Date().toISOString();
  }
  const { error } = await admin.from("User").upsert(userRow, { onConflict: "supabaseId" });

  if (error) {
    console.error("[create-user]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // G2B에서 업체 상세정보(면허·주소·설립일) 조회 후 CompanyProfile 자동 생성
  try {
    const g2bInfo = await fetchG2BCompanyInfo(body.bizNo);
    if (g2bInfo) {
      const { data: userData } = await admin
        .from("User")
        .select("id")
        .eq("supabaseId", user.id)
        .single();

      if (userData?.id) {
        await admin.from("CompanyProfile").upsert(
          {
            id:            crypto.randomUUID(),
            userId:        userData.id,
            bizNo:         body.bizNo,
            bizName:       g2bInfo.bizName || body.bizName,
            ceoName:       g2bInfo.ceoName || body.ownerName,
            address:       g2bInfo.address,
            establishedAt: g2bInfo.establishedAt,
            employeeCount: g2bInfo.employeeCount,
            licenses:      g2bInfo.licenses,
            mainCategory:  g2bInfo.licenses.find(l => l.isMain)?.licenseType ?? "",
            subCategories: g2bInfo.licenses.filter(l => !l.isMain).map(l => l.licenseType),
          },
          { onConflict: "userId" }
        );
      }
    }
  } catch (e) {
    console.error("[create-user] CompanyProfile 자동 생성 실패 (무시됨):", e);
  }

  return NextResponse.json({ ok: true });
}
