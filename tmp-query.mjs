import pkg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pkg;
const client = new Client({
  connectionString: "postgresql://postgres.lmgjgyxoogmxfavcircd:Psp295811*1@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});
await client.connect();

console.log("=== Step 1: subCategories 컬럼 + GIN 인덱스 추가 ===");

const r1 = await client.query(`
  ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "subCategories" TEXT[] DEFAULT '{}'
`);
console.log("컬럼 추가 완료:", r1.command);

const r2 = await client.query(`
  CREATE INDEX IF NOT EXISTS idx_announcement_subcategories
  ON "Announcement" USING GIN ("subCategories")
`);
console.log("GIN 인덱스 추가 완료:", r2.command);

// 컬럼 존재 확인
const r3 = await client.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'Announcement'
    AND column_name = 'subCategories'
`);
console.log("컬럼 확인:", JSON.stringify(r3.rows));

await client.end();
