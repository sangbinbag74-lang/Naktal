/**
 * 카카오 알림톡 발송 헬퍼
 * 미가입 또는 동의 없으면 Resend 이메일로 fallback
 *
 * 환경변수:
 *   KAKAO_REST_API_KEY
 *   KAKAO_TEMPLATE_ID_ALERT
 *   KAKAO_TEMPLATE_ID_OUTCOME
 *   KAKAO_TEMPLATE_ID_REMIND
 */

const KAKAO_API_BASE = "https://kapi.kakao.com/v1/api/talk/friends/message/send";

interface KakaoTemplateParams {
  templateId: string;
  receiverPhone: string;
  variables: Record<string, string>;
}

async function sendKakaoAlimtalk(params: KakaoTemplateParams): Promise<boolean> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return false;

  try {
    const res = await fetch(KAKAO_API_BASE, {
      method: "POST",
      headers: { "Authorization": "KakaoAK " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: params.templateId,
        receiver_uuids: [params.receiverPhone],
        template_args: params.variables,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmailFallback(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "낙탈AI <no-reply@naktal.ai>", to, subject, text }),
  }).catch(() => {});
}

/** 신규 공고 매칭 알림 */
export async function notifyNewAnnouncement(
  phone: string | null,
  email: string | null,
  announcementTitle: string,
  deadline: string,
): Promise<void> {
  const templateId = process.env.KAKAO_TEMPLATE_ID_ALERT ?? "";
  if (phone && templateId) {
    const sent = await sendKakaoAlimtalk({ templateId, receiverPhone: phone, variables: { title: announcementTitle, deadline } });
    if (sent) return;
  }
  if (email) await sendEmailFallback(email, "[낙탈AI] 새 공고 매칭: " + announcementTitle, "마감일: " + deadline + "\n\nhttps://naktal.ai/announcements");
}

/** 개찰 결과 입력 요청 알림 */
export async function notifyOutcomeRequest(
  phone: string | null,
  email: string | null,
  announcementTitle: string,
  outcomeUrl: string,
): Promise<void> {
  const templateId = process.env.KAKAO_TEMPLATE_ID_OUTCOME ?? "";
  if (phone && templateId) {
    const sent = await sendKakaoAlimtalk({ templateId, receiverPhone: phone, variables: { title: announcementTitle, url: outcomeUrl } });
    if (sent) return;
  }
  if (email) await sendEmailFallback(email, "[낙탈AI] " + announcementTitle + " 개찰 결과를 입력해주세요",
    "결과 입력 시 번호 추천 1회가 추가 지급됩니다.\n" + outcomeUrl);
}

/** 마감 D-1 리마인더 */
export async function notifyDeadlineReminder(
  phone: string | null,
  email: string | null,
  announcementTitle: string,
  deadline: string,
): Promise<void> {
  const templateId = process.env.KAKAO_TEMPLATE_ID_REMIND ?? "";
  if (phone && templateId) {
    const sent = await sendKakaoAlimtalk({ templateId, receiverPhone: phone, variables: { title: announcementTitle, deadline } });
    if (sent) return;
  }
  if (email) await sendEmailFallback(email, "[낙탈AI] 마감 D-1: " + announcementTitle, "내일 마감입니다. 번호 전략을 지금 확인하세요.\nhttps://naktal.ai/strategy");
}
