/**
 * 솔라피(Solapi) 카카오 알림톡 발송 (2026-07-10 — 박상빈님 솔라피 가입 완료로 선회)
 *
 * 필요 환경변수 (Vercel):
 *   SOLAPI_API_KEY / SOLAPI_API_SECRET  — 솔라피 콘솔 > API Key
 *   SOLAPI_PF_ID                        — 연동한 카카오 채널 pfId
 *   SOLAPI_SENDER                       — 등록된 발신번호 (예: 05050079882)
 *   SOLAPI_TEMPLATE_NEW_ANN             — [신규 공고 알림] 템플릿 ID (검수 승인 필수)
 *
 * env 미설정·발송 실패 시 false 반환 — 호출측은 이메일만으로 진행 (안전 폴백).
 * 템플릿 변수 규약: #{회사명} #{공고명} #{발주처} #{마감일}
 */
import { createHmac, randomBytes } from "crypto";

const API_URL = "https://api.solapi.com/messages/v4/send-many/detail";

function authHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export interface AlimtalkParams {
  to: string;                       // 수신 휴대폰 (숫자만)
  templateId?: string;              // 미지정 시 SOLAPI_TEMPLATE_NEW_ANN
  variables: Record<string, string>; // { "#{회사명}": "...", ... }
}

export function isSolapiConfigured(): boolean {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_PF_ID && process.env.SOLAPI_SENDER);
}

export async function sendAlimtalk(params: AlimtalkParams): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_PF_ID;
  const sender = process.env.SOLAPI_SENDER;
  const templateId = params.templateId ?? process.env.SOLAPI_TEMPLATE_NEW_ANN;
  if (!apiKey || !apiSecret || !pfId || !sender || !templateId) return false;

  const to = params.to.replace(/\D/g, "");
  if (to.length < 10) return false;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": authHeader(apiKey, apiSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            to,
            from: sender.replace(/\D/g, ""),
            type: "ATA", // 알림톡
            kakaoOptions: {
              pfId,
              templateId,
              variables: params.variables,
              disableSms: true, // 알림톡 실패 시 SMS 대체발송 안 함 (비용 통제 — 이메일 폴백은 호출측)
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[solapi] 발송 실패:", res.status, bodyText.slice(0, 200));
      return false;
    }
    // ⚠️ send-many/detail 은 HTTP 200 이어도 개별 메시지 거부 가능 (미승인 템플릿 = statusCode 1042 등).
    //    본문의 failedMessageList / registeredFailed 를 확인해야 실제 성공 판정 (2026-07-10 실측).
    try {
      const data = JSON.parse(bodyText) as {
        failedMessageList?: unknown[];
        groupInfo?: { count?: { registeredFailed?: number; total?: number; registeredSuccess?: number } };
      };
      const failedCount = Array.isArray(data.failedMessageList) ? data.failedMessageList.length : 0;
      const regFailed = data.groupInfo?.count?.registeredFailed ?? 0;
      if (failedCount > 0 || regFailed > 0) {
        console.error("[solapi] 개별 발송 거부(템플릿 미승인 등):", bodyText.slice(0, 250));
        return false;
      }
    } catch { /* 본문 파싱 실패 시 HTTP 200 이면 접수 성공 간주 */ }
    return true;
  } catch (e) {
    console.error("[solapi] 발송 오류:", e);
    return false;
  }
}
