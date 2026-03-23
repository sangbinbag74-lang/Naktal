import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchG2BCompanyInfo } from "@/lib/g2b-company";

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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // RLS 우회: service_role로 User 테이블 upsert
  // id는 Prisma cuid가 아닌 직접 insert이므로 직접 생성 (onConflict 시 무시됨)
  const admin = createAdminClient();
  const { error } = await admin.from("User").upsert(
    {
      id:          crypto.randomUUID(),
      supabaseId:  user.id,
      bizNo:       body.bizNo,
      bizName:     body.bizName,
      ownerName:   body.ownerName,
      notifyEmail: body.notifyEmail ?? null,
      notifyPhone: body.notifyPhone ?? null,
    },
    { onConflict: "supabaseId" }
  );

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
