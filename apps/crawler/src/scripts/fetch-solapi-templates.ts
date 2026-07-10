/** 읽기 전용 — 솔라피 카카오 알림톡 템플릿 목록·변수·검수상태 조회 (creds는 env로 주입, 파일에 미저장) */
import { createHmac, randomBytes } from "crypto";

function auth(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${sig}`;
}

(async () => {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) { console.log("creds 없음 (SOLAPI_API_KEY/SECRET env 필요)"); return; }
  const header = auth(key, secret);

  const endpoints = [
    "https://api.solapi.com/kakao/v2/templates?limit=100",
    "https://api.solapi.com/kakao/v1/templates?limit=100",
  ];

  for (const url of endpoints) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: header } });
    } catch (e) { console.log(`${url} → fetch 오류 ${(e as Error).message}`); continue; }
    console.log(`\n=== ${url} → ${res.status} ===`);
    const text = await res.text();
    if (!res.ok) { console.log(text.slice(0, 400)); continue; }

    let data: unknown;
    try { data = JSON.parse(text); } catch { console.log("JSON 파싱 실패:", text.slice(0, 300)); continue; }

    // 응답 형태 유연 파싱: templateList(obj/arr) | list | 배열 자체
    const d = data as Record<string, unknown>;
    const raw = d.templateList ?? d.list ?? d.templates ?? data;
    const arr: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : (typeof raw === "object" && raw !== null ? Object.values(raw as Record<string, unknown>) as Record<string, unknown>[] : []);

    if (arr.length === 0) { console.log("템플릿 0건. 원본 상위 키:", Object.keys(d).join(", ")); continue; }

    for (const t of arr) {
      const id = (t.templateId ?? t.id ?? "?") as string;
      const name = (t.name ?? "?") as string;
      const status = (t.status ?? t.inspectionStatus ?? t.templateStatus ?? "?") as string;
      const content = (t.content ?? "") as string;
      const vars = [...new Set((content.match(/#\{[^}]+\}/g) ?? []))];
      console.log(`\n[${id}]`);
      console.log(`  이름: ${name} · 상태: ${status}`);
      console.log(`  변수: ${vars.join("  ") || "(없음)"}`);
      console.log(`  본문: ${content.replace(/\n/g, " ⏎ ").slice(0, 180)}`);
    }
    return; // 첫 성공 엔드포인트만
  }
})();
