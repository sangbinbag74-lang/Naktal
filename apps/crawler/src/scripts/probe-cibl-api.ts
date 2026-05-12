import * as fs from "fs";
import * as path from "path";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../web/.env.local"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}
import { fetchAnnouncementPage } from "../fetchers/g2b-client";

(async () => {
  const tests = [
    { ym: "200305", desc: "옛날" },
    { ym: "201703", desc: "중간" },
    { ym: "202404", desc: "최신" },
  ];
  const ops = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;

  for (const t of tests) {
    console.log(`\n=== ${t.ym} (${t.desc}) ===`);
    for (const op of ops) {
      try {
        const r = await fetchAnnouncementPage({
          pageNo: 1, numOfRows: 5, inqryDiv: "1",
          inqryBgnDt: `${t.ym}010000`, inqryEndDt: `${t.ym}312359`,
          operation: op as any,
        });
        const items = r.items;
        let with_cibl = 0, with_mtl = 0, with_url = 0;
        for (const it of items) {
          if ("ciblAplYn" in it && it.ciblAplYn) with_cibl++;
          if ("mtltyAdvcPsblYn" in it && it.mtltyAdvcPsblYn) with_mtl++;
          if ("bidNtceDtlUrl" in it && it.bidNtceDtlUrl) with_url++;
        }
        console.log(`  [${op}] sample=${items.length}/총 ${r.totalCount}`);
        console.log(`    ciblAplYn 키 응답된 건수: ${with_cibl}/${items.length}`);
        console.log(`    mtltyAdvcPsblYn 키 응답된 건수: ${with_mtl}/${items.length}`);
        console.log(`    bidNtceDtlUrl 키 응답된 건수: ${with_url}/${items.length}`);
        if (items.length > 0) {
          const it = items[0];
          console.log(`    1번째 응답 키 전체: ${Object.keys(it).filter(k => k.includes("cibl") || k.includes("mtlty") || k.includes("Url") || k.includes("Tel")).join(", ")}`);
          console.log(`    값: ciblAplYn='${(it as any).ciblAplYn ?? "(없음)"}', mtltyAdvcPsblYn='${(it as any).mtltyAdvcPsblYn ?? "(없음)"}'`);
        }
      } catch (e: any) {
        console.log(`  [${op}] ERROR: ${e?.message || e}`);
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
