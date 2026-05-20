import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const COOKIE_NAME = "naktal_admin";
const EXPIRES_MS = 8 * 60 * 60 * 1000; // 8시간

function signToken(expiry: number): string {
  const secret = process.env.ADMIN_SECRET_KEY ?? "";
  const payload = String(expiry);
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** timing-safe 문자열 비교 (길이 차이도 false) */
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // IP 분당 5회 — brute force 방지
  const ip = getClientIp(req);
  const { allowed, resetAt } = await rateLimit(`${ip}:admin-login`, 5, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  const { id, password } = await req.json().catch(() => ({})) as Record<string, string>;

  const adminId = process.env.ADMIN_LOGIN_ID;
  const adminPw = process.env.ADMIN_LOGIN_PW;

  if (!adminId || !adminPw) {
    return NextResponse.json({ error: "관리자 계정이 설정되지 않았습니다." }, { status: 503 });
  }

  if (!id || !password || !safeEq(id, adminId) || !safeEq(password, adminPw)) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const expiry = Date.now() + EXPIRES_MS;
  const token = signToken(expiry);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: EXPIRES_MS / 1000,
  });
  return res;
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
