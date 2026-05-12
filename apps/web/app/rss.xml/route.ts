export const dynamic = "force-static";
export const revalidate = 3600;

const SITE = "https://naktal.me";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const now = new Date().toUTCString();
  const items = [
    {
      title: "낙비 — 공공입찰, 데이터로 답한다",
      link: `${SITE}`,
      description:
        "나라장터 공고를 머신러닝이 0.5초 만에 분석합니다. 사정율 예측, 복수예가 번호 추천, 공고문 자격 자동 분석, 낙찰 결과 추적까지.",
      pubDate: now,
    },
    {
      title: "자주 묻는 질문",
      link: `${SITE}/faq`,
      description: "낙비 사용 방법, 분석 정확도, 데이터 출처, 수수료 관련 자주 묻는 질문.",
      pubDate: now,
    },
    {
      title: "이용약관",
      link: `${SITE}/terms`,
      description: "낙비 서비스 이용약관.",
      pubDate: now,
    },
    {
      title: "개인정보처리방침",
      link: `${SITE}/privacy`,
      description: "낙비 개인정보 수집·이용·보관 방침.",
      pubDate: now,
    },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>낙비 — 나라장터 입찰 AI</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>공공입찰, 데이터로 답한다. 나라장터 공고를 머신러닝이 0.5초 만에 분석.</description>
    <language>ko-KR</language>
    <copyright>© 주식회사 호라이즌</copyright>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>60</ttl>
${items
  .map(
    (it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${it.link}</link>
      <guid isPermaLink="true">${it.link}</guid>
      <description>${esc(it.description)}</description>
      <pubDate>${it.pubDate}</pubDate>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
