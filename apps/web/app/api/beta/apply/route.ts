import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // IP 분당 3회 — 스팸 방지
  const ip = getClientIp(req);
  const { allowed, resetAt } = await rateLimit(`${ip}:beta-apply`, 3, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  const body = (await req.json()) as {
    bizNo?: string;
    bizName?: string;
    email?: string;
    category?: string;
  };

  if (!body.bizNo || !body.bizName || !body.email) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 사업자번호 형식 정리 (숫자만)
  const bizNo = body.bizNo.replace(/[^0-9]/g, "");
  if (bizNo.length !== 10) {
    return NextResponse.json({ error: "사업자등록번호는 10자리여야 합니다." }, { status: 400 });
  }

  // 이메일 형식 확인
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return NextResponse.json({ error: "올바른 이메일 형식을 입력해주세요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 중복 신청 확인
  const { data: existing } = await supabase
    .from("BetaApplication")
    .select("id,status")
    .eq("bizNo", bizNo)
    .maybeSingle();

  if (existing) {
    const statusMsg = existing.status === "APPROVED"
      ? "이미 승인된 신청입니다. 가입 이메일을 확인해주세요."
      : "이미 신청 접수된 사업자번호입니다.";
    return NextResponse.json({ error: statusMsg }, { status: 409 });
  }

  const { error } = await supabase.from("BetaApplication").insert({
    bizNo,
    bizName: body.bizName.trim(),
    email: body.email.trim().toLowerCase(),
    category: (body.category ?? "").trim(),
  });

  if (error) {
    console.error("BetaApplication insert error:", error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
