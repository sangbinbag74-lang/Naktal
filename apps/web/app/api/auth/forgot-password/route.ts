import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { bizNo?: string };
  const bizNo = body.bizNo?.replace(/\D/g, "");

  if (!bizNo || bizNo.length !== 10) {
    return NextResponse.json({ error: "사업자번호 10자리를 입력해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. DB에서 User 조회 → notifyEmail 확인
  const { data: dbUser } = await admin
    .from("User")
    .select("notifyEmail, supabaseId")
    .eq("bizNo", bizNo)
    .maybeSingle();

  if (!dbUser) {
    // 사용자 미존재여도 성공처럼 응답 (보안: 가입 여부 노출 방지)
    return NextResponse.json({ ok: true });
  }

  if (!dbUser.notifyEmail) {
    return NextResponse.json({ error: "등록된 알림 이메일이 없습니다. 고객센터에 문의해주세요." }, { status: 400 });
  }

  // 2. Supabase Admin으로 복구 링크 생성 (auth.users의 실제 이메일 biz_${bizNo}@naktal.biz 기준)
  const authEmail = `biz_${bizNo}@naktal.biz`;
  const { data: linkData, error: linkErr } = await (admin.auth as any).admin.generateLink({
    type: "recovery",
    email: authEmail,
    options: {
      redirectTo: `${SITE_URL}/auth/reset-password`,
    },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[forgot-password] generateLink 실패:", linkErr);
    return NextResponse.json({ error: "재설정 링크 생성에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }

  const resetLink = linkData.properties.action_link as string;

  // 3. Resend로 notifyEmail에 실제 발송
  const { error: emailErr } = await resend.emails.send({
    from: "NAKTAL <noreply@naktal.me>",
    to: dbUser.notifyEmail,
    subject: "[NAKTAL] 비밀번호 재설정 안내",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1B3A6B; margin-bottom: 8px;">NAKTAL 비밀번호 재설정</h2>
        <p style="color: #374151; margin-bottom: 24px;">
          아래 버튼을 클릭하면 새로운 비밀번호를 설정할 수 있습니다.<br/>
          이 링크는 <strong>1시간</strong> 동안 유효합니다.
        </p>
        <a href="${resetLink}"
           style="display:inline-block; background:#1B3A6B; color:#fff; padding:14px 28px;
                  border-radius:10px; text-decoration:none; font-weight:600; font-size:15px;">
          비밀번호 재설정하기
        </a>
        <p style="color:#9CA3AF; font-size:12px; margin-top:24px;">
          본인이 요청하지 않았다면 이 이메일을 무시하세요.<br/>
          문의: support@naktal.me
        </p>
      </div>
    `,
  });

  if (emailErr) {
    console.error("[forgot-password] Resend 발송 실패:", emailErr);
    return NextResponse.json({ error: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
