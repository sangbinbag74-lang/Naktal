import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KakaoTokenResponse = {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

type KakaoUserResponse = {
  id: number;
  kakao_account?: {
    name?: string;
    phone_number?: string;
    email?: string;
    profile?: { nickname?: string };
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const REST_API_KEY = process.env.KAKAO_REST_API_KEY;
  if (!REST_API_KEY) {
    return NextResponse.json({ ok: false, error: "KAKAO_REST_API_KEY 미설정" }, { status: 500 });
  }

  let body: { code: string; redirectUri: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  if (!body.code || !body.redirectUri) {
    return NextResponse.json({ ok: false, error: "code 또는 redirectUri 누락" }, { status: 400 });
  }

  // 1. authorization code → access_token
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: REST_API_KEY,
      redirect_uri: body.redirectUri,
      code: body.code,
    }),
  });
  const tokenData = (await tokenRes.json()) as KakaoTokenResponse;
  if (!tokenData.access_token) {
    console.error("[kakao-exchange] token failed", tokenData);
    return NextResponse.json(
      { ok: false, error: tokenData.error_description ?? "카카오 토큰 발급 실패" },
      { status: 400 }
    );
  }

  // 2. access_token → 사용자 정보
  const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    return NextResponse.json({ ok: false, error: "카카오 사용자 정보 조회 실패" }, { status: 400 });
  }
  const userData = (await userRes.json()) as KakaoUserResponse;
  const account = userData.kakao_account ?? {};
  const name = account.name ?? account.profile?.nickname ?? "";

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "카카오에서 이름을 받아오지 못했습니다. 비즈앱 심사 통과 후 다시 시도해주세요." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    kakaoId: String(userData.id),
    name,
    phone: account.phone_number ?? null,
    email: account.email ?? null,
  });
}
