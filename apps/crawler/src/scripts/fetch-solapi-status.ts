/** 읽기 전용 — 솔라피 템플릿 상태 + 최근 발송 메시지 결과(과금/실패 여부) 조회. creds는 env 주입. */
import { createHmac, randomBytes } from "crypto";
function auth(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${sig}`;
}
const mask = (p: string) => p ? p.slice(0, 3) + "****" + p.slice(-2) : "?";
(async () => {
  const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) { console.log("creds 없음"); return; }
  const H = { Authorization: auth(key, secret) };

  // 1. 템플릿 상태
  const tr = await fetch("https://api.solapi.com/kakao/v2/templates?limit=100", { headers: H });
  if (tr.ok) {
    const d = await tr.json() as Record<string, unknown>;
    const raw = d.templateList ?? d.list ?? d;
    const arr = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
    console.log("=== 템플릿 상태 ===");
    for (const t of arr as Record<string, unknown>[]) {
      console.log(`  ${t.name} · ${t.status ?? t.inspectionStatus ?? "?"} (${t.templateId})`);
    }
  } else console.log("템플릿 조회 실패", tr.status);

  // 2. 최근 발송 메시지 (statusCode/과금)
  const mr = await fetch("https://api.solapi.com/messages/v4/list?limit=12", { headers: { Authorization: auth(key, secret) } });
  console.log(`\n=== 최근 메시지 (${mr.status}) ===`);
  if (!mr.ok) { console.log((await mr.text()).slice(0, 400)); return; }
  const md = await mr.json() as { messageList?: Record<string, Record<string, unknown>> };
  const list = md.messageList ? Object.values(md.messageList) : [];
  if (list.length === 0) { console.log("발송 이력 0건 (실제 나간 메시지 없음)"); return; }
  for (const m of list) {
    console.log(`  ${String(m.dateCreated).slice(0, 19)} | to ${mask(String(m.to))} | type ${m.type} | statusCode ${m.statusCode} | ${m.statusMessage ?? ""}`);
  }
})();
