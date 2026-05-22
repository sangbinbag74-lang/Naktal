/**
 * PR 자동 이메일 발송 — Resend API 사용.
 *
 * 박상빈님 데이터 0 노출 — content-queue.ts(랜딩 페이지 정보만)만 사용.
 * 기자/매체 리스트는 PR_PRESS_EMAILS 환경변수(콤마 구분)에서 로딩.
 *
 * 필요 환경변수:
 *   RESEND_API_KEY (이미 박상빈님 사이트에 등록되어 있음)
 *   PR_PRESS_EMAILS — 기자/매체 이메일 콤마 구분
 *     예: "press@example1.com, news@example2.co.kr"
 *
 * 리스트가 비어있으면 즉시 noop.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "낙비 보도자료 <no-reply@naktal.me>";

export type PrSendResult = {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  message: string;
};

function readPressEmails(): string[] {
  const raw = process.env.PR_PRESS_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));
}

async function sendOne(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendPrEmail(subject: string, text: string): Promise<PrSendResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, sentCount: 0, failedCount: 0, message: "RESEND_API_KEY not set" };
  }
  const press = readPressEmails();
  if (press.length === 0) {
    return { ok: false, sentCount: 0, failedCount: 0, message: "PR_PRESS_EMAILS not set or empty" };
  }

  let sent = 0;
  let failed = 0;
  for (const to of press) {
    const ok = await sendOne(to, subject, text);
    if (ok) sent++;
    else failed++;
    // 발송 간 200ms 대기 — Resend rate limit 보호
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    ok: sent > 0,
    sentCount: sent,
    failedCount: failed,
    message: `sent=${sent} failed=${failed} total=${press.length}`,
  };
}
