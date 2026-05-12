import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizePhone(phone: string): string {
  return String(phone).replace(/\D/g, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as { phone?: string; code?: string };
  const phone = normalizePhone(body.phone ?? "");
  const code = String(body.code ?? "").trim();

  if (phone.length !== 11 || code.length !== 6) {
    return NextResponse.json({ ok: false, error: "전화번호와 6자리 인증번호를 확인해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  // 가장 최근 미사용 OTP 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: otpRows } = await (admin.from("PhoneOtp") as any)
    .select("id,code,expiresAt,verifiedAt,attempts")
    .eq("phone", phone)
    .is("verifiedAt", null)
    .order("createdAt", { ascending: false })
    .limit(1);

  const otp = otpRows?.[0];
  if (!otp) {
    return NextResponse.json({ ok: false, error: "인증번호 발송 내역이 없습니다. 재발송 해주세요." }, { status: 400 });
  }
  if (new Date(otp.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: "인증번호가 만료되었습니다. 재발송 해주세요." }, { status: 400 });
  }
  if (otp.attempts >= 5) {
    return NextResponse.json({ ok: false, error: "인증 시도 횟수를 초과했습니다. 재발송 해주세요." }, { status: 429 });
  }

  // 검증
  if (otp.code !== code) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("PhoneOtp") as any).update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    return NextResponse.json({ ok: false, error: `인증번호가 일치하지 않습니다. (${otp.attempts + 1}/5회 시도)` }, { status: 400 });
  }

  // 성공
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("PhoneOtp") as any).update({ verifiedAt: new Date().toISOString() }).eq("id", otp.id);

  return NextResponse.json({ ok: true, phone });
}
