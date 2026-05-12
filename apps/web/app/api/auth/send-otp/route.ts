import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY ?? "";
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET ?? "";
const SOLAPI_SENDER = process.env.SOLAPI_SENDER ?? "";

function makeAuthHeader(): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const data = date + salt;
  const signature = crypto.createHmac("sha256", SOLAPI_API_SECRET).update(data).digest("hex");
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

function normalizePhone(phone: string): string {
  // 010-1234-5678 → 01012345678
  return String(phone).replace(/\D/g, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as { phone?: string };
  const phone = normalizePhone(body.phone ?? "");

  if (phone.length !== 11 || !phone.startsWith("010")) {
    return NextResponse.json({ ok: false, error: "010 으로 시작하는 11자리 휴대폰 번호를 입력해주세요." }, { status: 400 });
  }

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_SENDER) {
    console.error("[send-otp] Solapi 환경변수 미설정");
    return NextResponse.json({ ok: false, error: "SMS 발송 설정이 완료되지 않았습니다. 관리자에게 문의해주세요." }, { status: 500 });
  }

  const admin = createAdminClient();
  // 같은 번호 1분 이내 재발송 차단 (남용 방지)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent } = await (admin.from("PhoneOtp") as any)
    .select("createdAt")
    .eq("phone", phone)
    .gt("createdAt", new Date(Date.now() - 60 * 1000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) {
    return NextResponse.json({ ok: false, error: "1분 안에 다시 요청할 수 없습니다. 잠시 후 재시도해주세요." }, { status: 429 });
  }

  // 6자리 OTP 생성
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5분 만료

  // DB 저장
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin.from("PhoneOtp") as any).insert({
    id: crypto.randomUUID(),
    phone,
    code,
    expiresAt,
    attempts: 0,
  });
  if (dbErr) {
    console.error("[send-otp] DB 저장 실패:", dbErr.message);
    return NextResponse.json({ ok: false, error: "저장 실패" }, { status: 500 });
  }

  // Solapi SMS 발송
  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: makeAuthHeader(),
      },
      body: JSON.stringify({
        message: {
          to: phone,
          from: SOLAPI_SENDER,
          text: `[낙비] 인증번호 [${code}] (5분 이내 입력)`,
        },
      }),
    });
    const result = await res.json() as { statusCode?: string; statusMessage?: string };
    if (!res.ok || (result.statusCode && result.statusCode !== "2000" && result.statusCode !== "2001")) {
      console.error("[send-otp] Solapi 발송 실패:", result);
      return NextResponse.json({ ok: false, error: `발송 실패: ${result.statusMessage ?? "알 수 없음"}` }, { status: 500 });
    }
  } catch (e) {
    console.error("[send-otp] Solapi API 오류:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "SMS 발송 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "인증번호를 발송했습니다. 5분 이내에 입력해주세요." });
}
