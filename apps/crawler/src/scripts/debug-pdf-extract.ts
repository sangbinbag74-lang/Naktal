/**
 * 단일 공고 PDF/HWP 본문 추출 디버그
 * 가로수 보식사업 (PDF) + HWP 1건 (다른 공고) 비교
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { extractRgnLimitFromPdf } from "../lib/pdf-region-extract";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
const execFileAsync = promisify(execFile);

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // unknown 처리된 공고 5건 가져와서 raw text 확인
    const r = await p.query(`
      SELECT "konepsId", title, "rawJson"->>'ntceSpecDocUrl1' AS pdf
      FROM "Announcement"
      WHERE "pdfRgnLimit"->>'type' = 'unknown'
        AND "rawJson"->>'ntceSpecDocUrl1' IS NOT NULL
      LIMIT 5
    `);
    process.stdout.write(`SAMPLE_COUNT=${r.rows.length}\n`);

    for (const row of r.rows) {
      process.stdout.write(`\n=== ${row.konepsId} | ${(row.title as string).slice(0, 40)} ===\n`);
      const docUrl = row.pdf;
      process.stdout.write(`URL: ${docUrl.slice(0, 130)}\n`);

      // 파일 다운로드
      const tmp = join(tmpdir(), `dbg-${randomUUID()}.tmp`);
      const res = await fetch(docUrl, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
      const ct = res.headers.get("content-type") ?? "";
      const cd = res.headers.get("content-disposition") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      process.stdout.write(`HTTP=${res.status} CT=${ct} CD=${cd.slice(0, 80)} SIZE=${buf.length}\n`);
      const magic = buf.slice(0, 8).toString("hex");
      process.stdout.write(`MAGIC=${magic}\n`);
      await writeFile(tmp, buf);

      // PDF or HWP 시도
      let text = "";
      const isPdf = ct.includes("pdf") || /\.pdf/i.test(cd) || buf.slice(0, 4).toString() === "%PDF";
      const isHwp = buf.slice(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
      process.stdout.write(`PDF=${isPdf} HWP=${isHwp}\n`);
      try {
        if (isPdf) {
          const { stdout } = await execFileAsync("pdftotext", ["-enc", "UTF-8", "-layout", tmp, "-"], { maxBuffer: 10*1024*1024, timeout: 30_000 });
          text = stdout;
        } else if (isHwp) {
          const { stdout } = await execFileAsync("hwp5txt", [tmp], { maxBuffer: 10*1024*1024, timeout: 30_000, encoding: "utf8" });
          text = stdout;
        }
      } catch (e) {
        process.stdout.write(`EXTRACT_ERR=${(e as Error).message.slice(0, 200)}\n`);
      }
      process.stdout.write(`TEXT_LEN=${text.length}\n`);
      // 첫 1000자 일부 — 자격 키워드 검색
      const idx = text.search(/참가\s*자격|입찰\s*참가|자격\s*요건/);
      process.stdout.write(`자격_IDX=${idx}\n`);
      if (idx >= 0) {
        const chunk = text.slice(idx, idx + 800).replace(/\s+/g, " ");
        process.stdout.write(`자격_TEXT: ${chunk}\n`);
      }

      // 우리 함수 결과
      const result = await extractRgnLimitFromPdf(docUrl);
      process.stdout.write(`RESULT: ${JSON.stringify(result)}\n`);

      await unlink(tmp).catch(() => {});
    }
  } finally {
    await p.end();
    process.exit(0);
  }
})().catch(e => { console.error(e); process.exit(1); });
