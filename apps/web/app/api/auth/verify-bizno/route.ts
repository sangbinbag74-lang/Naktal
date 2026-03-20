import { NextRequest, NextResponse } from "next/server";

const NTS_API_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";

interface NtsItem {
  b_stt_cd: string;  // "01"=계속사업자, "02"=휴업, "03"=폐업
  b_stt: string;
  tax_type: string;
}

interface NtsResponse {
  status_code: string;
  data?: NtsItem[];
  match_cnt?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let bizNo: string;
  try {
    const body = (await request.json()) as { bizNo?: string };
    bizNo = (body.bizNo ?? "").replace(/\D/g, "");
  } catch {
    return NextResponse.json({ valid: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  if (bizNo.length !== 10) {
    return NextResponse.json({ valid: false, message: "사업자번호는 10자리여야 합니다." });
  }

  const apiKey = process.env.NTS_API_KEY;
  if (!apiKey) {
    // API 키 미설정 시 가입 허용 (서비스 중단 방지)
    console.error("[verify-bizno] NTS_API_KEY 미설정 — 검증 스킵");
    return NextResponse.json({ valid: true, message: "검증 스킵 (API키 미설정)" });
  }

  try {
    const res = await fetch(`${NTS_API_URL}?serviceKey=${apiKey}&returnType=JSON`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [bizNo] }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[verify-bizno] NTS API 오류: ${res.status}`);
      // API 오류 시 가입 허용
      return NextResponse.json({ valid: true, message: "검증 API 오류 — 가입 허용" });
    }

    const data = (await res.json()) as NtsResponse;
    const item = data.data?.[0];

    if (!item) {
      return NextResponse.json({ valid: false, message: "등록되지 않은 사업자번호입니다." });
    }

    if (item.b_stt_cd === "02") {
      return NextResponse.json({ valid: false, message: "휴업 상태의 사업자번호입니다." });
    }
    if (item.b_stt_cd === "03") {
      return NextResponse.json({ valid: false, message: "폐업된 사업자번호입니다." });
    }

    return NextResponse.json({ valid: true, status: item.b_stt });
  } catch (err) {
    console.error("[verify-bizno] 예외:", err);
    // 타임아웃·네트워크 오류 시 가입 허용
    return NextResponse.json({ valid: true, message: "검증 실패 — 가입 허용" });
  }
}
