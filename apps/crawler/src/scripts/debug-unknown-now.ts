/**
 * unknown 처리된 공고 5건 직접 다운+추출 → 어디서 막히는지
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
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
    process.stdout.write("=== 최근 unknown 5건 (deadline 임박) ===\n");
    const r = await p.query(`
      SELECT "konepsId", title, "rawJson"->>'ntceSpecDocUrl1' AS pdf
      FROM "Announcement"
      WHERE "pdfRgnLimit"->>'type' = 'unknown'
        AND deadline > NOW()
        AND "rawJson"->>'ntceSpecDocUrl1' IS NOT NULL
      ORDER BY deadline ASC LIMIT 5
    `);
    for (const row of r.rows) {
      process.stdout.write(`\n--- ${row.konepsId} | ${row.title.slice(0,40)} ---\n`);
      const tmp = join(tmpdir(), `dbg-${randomUUID()}.tmp`);
      try {
        const res = await fetch(row.pdf, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
        const ct = res.headers.get("content-type") ?? "";
        const cd = res.headers.get("content-disposition") ?? "";
        const buf = Buffer.from(await res.arrayBuffer());
        const magic = buf.slice(0, 4).toString("hex");
        process.stdout.write(`HTTP=${res.status} CT=${ct.slice(0,40)} SIZE=${buf.length} MAGIC=${magic}\n`);
        await writeFile(tmp, buf);
        const isPdf = ct.includes("pdf") || /\.pdf/i.test(cd) || buf.slice(0, 4).toString() === "%PDF";
        const isHwp = buf.slice(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
        process.stdout.write(`isPdf=${isPdf} isHwp=${isHwp}\n`);
        let text = "";
        try {
          if (isPdf) {
            const out = await execFileAsync("pdftotext", ["-enc","UTF-8","-layout",tmp,"-"], { maxBuffer: 10*1024*1024, timeout: 30_000 });
            text = out.stdout;
          } else if (isHwp) {
            const out = await execFileAsync("hwp5txt", [tmp], { maxBuffer: 10*1024*1024, timeout: 30_000, encoding: "utf8" });
            text = out.stdout;
          }
        } catch (e) {
          process.stdout.write(`EXTRACT_ERR=${(e as Error).message.slice(0,200)}\n`);
        }
        process.stdout.write(`TEXT_LEN=${text.length}\n`);
        if (text.length > 0) {
          // 자격 키워드
          const idx = text.search(/참가\s*자격|입찰\s*참가|자격\s*요건|입찰\s*에\s*참가/);
          process.stdout.write(`자격_IDX=${idx}\n`);
          if (idx >= 0) {
            const chunk = text.slice(idx, idx + 600).replace(/\s+/g, " ");
            process.stdout.write(`자격: ${chunk}\n`);
          } else {
            // 전체 텍스트 첫 600자 보기
            process.stdout.write(`첫 600자: ${text.slice(0, 600).replace(/\s+/g, " ")}\n`);
          }
        }
      } finally {
        await unlink(tmp).catch(() => {});
      }
    }
  } finally { await p.end(); process.exit(0); }
})();
