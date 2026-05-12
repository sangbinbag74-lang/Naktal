import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    process.stdout.write("CHECK_START\n");
    // ALTER TABLE
    await p.query(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfRgnLimit" jsonb`);
    await p.query(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "pdfParsedAt" timestamptz`);
    process.stdout.write("ALTER_DONE\n");

    // 컬럼 존재 검증
    const r = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Announcement' AND column_name IN ('pdfRgnLimit','pdfParsedAt') ORDER BY column_name`);
    process.stdout.write("COLS=" + r.rows.map(x => x.column_name).join(",") + "\n");

    // MV 존재 확인 + 컬럼 포함 확인
    const mv = await p.query(`SELECT 1 FROM pg_matviews WHERE matviewname='AnnouncementActive'`);
    process.stdout.write("MV_EXISTS=" + (mv.rowCount! > 0) + "\n");

    if (mv.rowCount! > 0) {
      const mvcol = await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='AnnouncementActive' AND column_name='pdfRgnLimit'`);
      process.stdout.write("MV_HAS_PDFCOL=" + (mvcol.rowCount! > 0) + "\n");
      if (mvcol.rowCount === 0) {
        process.stdout.write("RECREATING_MV...\n");
        await p.query(`DROP MATERIALIZED VIEW IF EXISTS "AnnouncementActive" CASCADE`);
        await p.query(`CREATE MATERIALIZED VIEW "AnnouncementActive" AS SELECT * FROM "Announcement" WHERE deadline > NOW()`);
        await p.query(`CREATE UNIQUE INDEX ON "AnnouncementActive" (id)`);
        await p.query(`CREATE INDEX ON "AnnouncementActive" (deadline DESC)`);
        await p.query(`CREATE INDEX ON "AnnouncementActive" ("createdAt" DESC)`);
        await p.query(`CREATE INDEX ON "AnnouncementActive" (category)`);
        await p.query(`CREATE INDEX ON "AnnouncementActive" (region)`);
        await p.query(`CREATE INDEX ON "AnnouncementActive" USING gin ("subCategories")`);
        await p.query(`ANALYZE "AnnouncementActive"`);
        process.stdout.write("MV_RECREATED\n");
      }
    } else {
      process.stdout.write("CREATING_MV_FRESH...\n");
      await p.query(`CREATE MATERIALIZED VIEW "AnnouncementActive" AS SELECT * FROM "Announcement" WHERE deadline > NOW()`);
      await p.query(`CREATE UNIQUE INDEX ON "AnnouncementActive" (id)`);
      await p.query(`CREATE INDEX ON "AnnouncementActive" (deadline DESC)`);
      await p.query(`CREATE INDEX ON "AnnouncementActive" ("createdAt" DESC)`);
      await p.query(`CREATE INDEX ON "AnnouncementActive" (category)`);
      await p.query(`CREATE INDEX ON "AnnouncementActive" (region)`);
      await p.query(`CREATE INDEX ON "AnnouncementActive" USING gin ("subCategories")`);
      await p.query(`ANALYZE "AnnouncementActive"`);
      process.stdout.write("MV_CREATED\n");
    }

    process.stdout.write("ALL_DONE\n");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();
