// Phase 3 lowerlimit ONNX 3개 → Supabase Storage 업로드
// Vercel 50MB 한도 우회 — 런타임에서 fetch
//
// Storage 구조: ml-models/lowerlimit/{q05,q50,q95}.onnx (public read)
//
// 실행:
//   pnpm --filter @naktal/crawler ts-node src/scripts/upload-models-to-storage.ts
import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import * as fs from "fs";
import * as path from "path";

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "../../../../.env.local"));
loadEnv(path.resolve(__dirname, "../../../../.env"));
loadEnv(path.resolve(__dirname, "../../../web/.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
}

const BUCKET = "ml-models";
const ML_DIR = path.resolve(__dirname, "../../../web/ml");
const FILES = [
  { local: "lowerlimit_q05.onnx", remote: "lowerlimit/q05.onnx" },
  { local: "lowerlimit_q50.onnx", remote: "lowerlimit/q50.onnx" },
  { local: "lowerlimit_q95.onnx", remote: "lowerlimit/q95.onnx" },
];

(async () => {
  const sb = createClient(SUPABASE_URL!, SERVICE_ROLE!);

  // 1. 버킷 생성 (이미 있으면 무시)
  console.log(`[1/3] 버킷 '${BUCKET}' 확인/생성`);
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  // 모델 최대 사이즈 = 200MB (실제 가장 큰 모델 180MB + 마진)
  const MAX_SIZE = 200 * 1024 * 1024;
  if (!exists) {
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
    });
    if (error) {
      console.error("버킷 생성 실패:", error.message);
      throw error;
    }
    console.log(`  버킷 '${BUCKET}' 신규 생성 완료 (fileSizeLimit=${MAX_SIZE / 1024 / 1024}MB)`);
  } else {
    console.log(`  버킷 '${BUCKET}' 기존 사용`);
  }
  // public + fileSizeLimit 항상 강제 (기존 버킷이 작은 제한 갖고 있어도 갱신)
  const { error: upErr } = await sb.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
  });
  if (upErr) console.warn("  updateBucket 경고:", upErr.message);
  else console.log(`  fileSizeLimit ${MAX_SIZE / 1024 / 1024}MB 적용`);

  // 2. 파일 업로드
  console.log(`\n[2/3] 파일 업로드 (${FILES.length}개)`);
  const urls: Record<string, string> = {};
  for (const f of FILES) {
    const localPath = path.join(ML_DIR, f.local);
    if (!fs.existsSync(localPath)) {
      console.error(`  ${f.local} 파일 없음 — 건너뜀`);
      continue;
    }
    const buf = fs.readFileSync(localPath);
    const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
    console.log(`  업로드 (TUS resumable): ${f.local} (${sizeMB} MB) → ${f.remote}`);
    const t0 = Date.now();
    // 일반 upload 는 50MB 한도 → TUS resumable 로 큰 파일 전송
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(buf as unknown as Blob, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${SERVICE_ROLE}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: BUCKET,
          objectName: f.remote,
          contentType: "application/octet-stream",
          cacheControl: "31536000",
        },
        onError: (err) => reject(err),
        onProgress: (sent, total) => {
          if (sent === total) return;
          const pct = ((sent / total) * 100).toFixed(0);
          process.stdout.write(`\r    진행 ${pct}%`);
        },
        onSuccess: () => {
          process.stdout.write("\r                    \r");
          resolve();
        },
      });
      upload.start();
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(f.remote);
    urls[f.remote] = publicUrl;
    console.log(`    완료 (${elapsed}s) → ${publicUrl}`);
  }

  // 3. URL 매니페스트 저장 (Next.js 에서 읽을 수 있게)
  console.log("\n[3/3] URL 매니페스트 저장");
  const manifestPath = path.resolve(ML_DIR, "storage_manifest.json");
  const manifest = {
    bucket: BUCKET,
    supabase_url: SUPABASE_URL,
    uploaded_at: new Date().toISOString(),
    files: urls,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  저장: ${manifestPath}`);
  console.log("\n=== 완료 ===");
  for (const [k, v] of Object.entries(urls)) {
    console.log(`  ${k}: ${v}`);
  }
})();
