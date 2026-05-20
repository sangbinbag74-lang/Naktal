import { NextRequest, NextResponse } from "next/server";
import { fetchG2BCompanyInfo } from "@/lib/g2b-company";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/** 회원가입 중 사업자번호로 G2B 업체정보 조회 (인증 불필요 — 공개 정보) */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // IP 분당 10회 — G2B API 보호
  const ip = getClientIp(request);
  const { allowed, resetAt } = await rateLimit(`${ip}:lookup-biz`, 10, 60);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  const bizNo = request.nextUrl.searchParams.get("bizNo")?.replace(/-/g, "") ?? "";
  if (bizNo.length !== 10) {
    return NextResponse.json({ ok: false, error: "bizNo 10자리 필요" }, { status: 400 });
  }

  try {
    const info = await fetchG2BCompanyInfo(bizNo);
    if (!info) {
      return NextResponse.json({ ok: false, error: "나라장터 미등록 업체" });
    }
    return NextResponse.json({ ok: true, bizName: info.bizName, ceoName: info.ceoName });
  } catch (e) {
    console.error("[lookup-biz]", e);
    return NextResponse.json({ ok: false, error: "G2B API 오류" });
  }
}
