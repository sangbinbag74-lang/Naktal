import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://naktal.me";

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

interface WonData {
  bizName: string;
  title: string;
  orgName: string;
  actualFinalPrice: number;
  feeRate: number;
  feeAmount: number;
}

interface LostData {
  bizName: string;
  title: string;
  orgName: string;
  winnerName: string | null;
}

function buildWonHtml(d: WonData): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">Naktal.ai</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 20px">${d.bizName}님, 낙찰을 진심으로 축하드립니다!</p>

    <div style="background:linear-gradient(135deg,#1B3A6B,#2563EB);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
      <div style="color:#93C5FD;font-size:12px;font-weight:600;margin-bottom:6px">🎉 낙찰 확정</div>
      <div style="color:#fff;font-size:24px;font-weight:900">${fmtPrice(d.actualFinalPrice)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
      <tr><td style="padding:8px 0;color:#64748B;width:130px">공고명</td><td style="font-weight:600">${d.title}</td></tr>
      <tr><td style="padding:8px 0;color:#64748B">발주처</td><td>${d.orgName}</td></tr>
      <tr><td style="padding:8px 0;color:#64748B">낙찰금액</td><td style="font-weight:700;color:#1B3A6B">${fmtPrice(d.actualFinalPrice)}</td></tr>
    </table>

    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:10px">수수료 납부 안내</div>
      <table style="width:100%;font-size:13px">
        <tr>
          <td style="color:#78350F;padding:4px 0">수수료 (${(d.feeRate * 100).toFixed(1)}%)</td>
          <td style="text-align:right;font-weight:700;color:#92400E">${fmtPrice(d.feeAmount)}</td>
        </tr>
        <tr>
          <td style="color:#78350F;padding:4px 0">납부 기한</td>
          <td style="text-align:right">낙찰 공고일로부터 14일 이내</td>
        </tr>
      </table>
      <div style="margin-top:12px;padding:12px;background:#fff;border-radius:6px;border:1px solid #FDE68A">
        <div style="font-size:12px;font-weight:700;color:#78350F;margin-bottom:4px">납부 계좌</div>
        <div style="font-size:13px;color:#374151">신한은행 100-038-306439</div>
        <div style="font-size:12px;color:#6B7280">예금주: 주식회사 호라이즌</div>
      </div>
    </div>

    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;margin-bottom:20px;font-size:12px;color:#991B1B">
      <strong>⚠️ 미납 시 제재 안내</strong><br/>
      납부 기한 초과 시 연 6% 지연이자가 부과되며, 서비스 이용이 영구 제한될 수 있습니다.
      30일 초과 미납 시 민사소송 등 법적 조치를 취할 수 있으며, 소송비용은 전액 이용자 부담입니다.
    </div>

    <a href="${SITE_URL}/contracts" style="display:block;text-align:center;padding:14px;background:#1B3A6B;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">계약 서류 확인하기</a>

    <p style="color:#9CA3AF;font-size:11px;margin-top:20px;text-align:center">
      이 메일은 Naktal.ai 서비스 이용 계약에 따라 자동 발송되었습니다.
    </p>
  </div>
</div>`;
}

function buildLostHtml(d: LostData): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e8ecf2">
    <h1 style="color:#1B3A6B;font-size:20px;margin:0 0 4px">Naktal.ai</h1>
    <p style="color:#64748B;font-size:13px;margin:0 0 20px">${d.bizName}님께 결과를 안내드립니다.</p>

    <div style="background:#F1F5F9;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
      <div style="font-size:28px;margin-bottom:8px">😔</div>
      <div style="color:#475569;font-size:15px;font-weight:700">이번 공고는 미낙찰되었습니다</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
      <tr><td style="padding:8px 0;color:#64748B;width:130px">공고명</td><td style="font-weight:600">${d.title}</td></tr>
      <tr><td style="padding:8px 0;color:#64748B">발주처</td><td>${d.orgName}</td></tr>
      ${d.winnerName ? `<tr><td style="padding:8px 0;color:#64748B">낙찰 업체</td><td>${d.winnerName}</td></tr>` : ""}
    </table>

    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#166534">
      ✅ 미낙찰 시 수수료는 <strong>일절 발생하지 않습니다.</strong>
    </div>

    <p style="font-size:13px;color:#374151;margin-bottom:20px">
      AI 분석 결과는 통계적 참고 자료이며, 다음 공고에서 더 좋은 결과를 기대합니다.
      지속적인 데이터 학습으로 추천 정확도를 높여가겠습니다.
    </p>

    <a href="${SITE_URL}/announcements" style="display:block;text-align:center;padding:14px;background:#1B3A6B;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">다음 공고 분석하기</a>

    <p style="color:#9CA3AF;font-size:11px;margin-top:20px;text-align:center">
      이 메일은 Naktal.ai 서비스 이용 계약에 따라 자동 발송되었습니다.
    </p>
  </div>
</div>`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { bidRequestId } = body as { bidRequestId?: string };
  if (!bidRequestId) {
    return NextResponse.json({ ok: false, error: "bidRequestId 필수" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("BidRequest")
    .select("userId,title,orgName,actualFinalPrice,feeRate,feeAmount,isWon,winnerName")
    .eq("id", bidRequestId)
    .maybeSingle();

  if (!req) {
    return NextResponse.json({ ok: false, error: "BidRequest 없음" }, { status: 404 });
  }

  const { data: user } = await admin
    .from("User")
    .select("bizName,notifyEmail")
    .eq("id", req.userId as string)
    .maybeSingle();

  if (!user?.notifyEmail) {
    return NextResponse.json({ ok: true, sent: false, reason: "notifyEmail 없음" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const isWon = Boolean(req.isWon);
  const title = req.title as string;

  const subject = isWon
    ? `[Naktal.ai] 🎉 낙찰을 축하드립니다! - ${title}`
    : `[Naktal.ai] 아쉽게도 이번엔 미낙찰입니다 - ${title}`;

  const html = isWon
    ? buildWonHtml({
        bizName: user.bizName as string,
        title,
        orgName: req.orgName as string,
        actualFinalPrice: Number(req.actualFinalPrice ?? 0),
        feeRate: Number(req.feeRate ?? 0),
        feeAmount: Number(req.feeAmount ?? 0),
      })
    : buildLostHtml({
        bizName: user.bizName as string,
        title,
        orgName: req.orgName as string,
        winnerName: req.winnerName as string | null,
      });

  try {
    await resend.emails.send({
      from: "NAKTAL <noreply@naktal.me>",
      to: user.notifyEmail as string,
      subject,
      html,
    });
    return NextResponse.json({ ok: true, sent: true });
  } catch (err) {
    console.error("[bid-won 이메일 발송 실패]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
