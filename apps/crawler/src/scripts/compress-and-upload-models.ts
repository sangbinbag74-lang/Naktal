// Phase 3 lowerlimit ONNX → gzip 압축 → Vercel Blob 재업로드 + 무결성 검증
//
// 흐름:
//   1) 원본 ONNX 의 SHA256 계산 (검증 baseline)
//   2) gzip(level 9) 으로 압축 → .onnx.gz
//   3) 압축 결과를 다시 풀어서 SHA256 비교 (무결성 검증)
//   4) Vercel Blob 에 .onnx.gz 업로드
//   5) manifest 갱신
import { put } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import * as crypto from "crypto";

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

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 없음");

const ML_DIR = path.resolve(__dirname, "../../../web/ml");
const TARGETS = [
  "lowerlimit_q05.onnx",
  "lowerlimit_q50.onnx",
  "lowerlimit_q95.onnx",
];

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

(async () => {
  console.log("=== ONNX gzip 압축 + 무결성 검증 + Vercel Blob 업로드 ===\n");

  const manifestPath = path.join(ML_DIR, "ensemble_manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const newUrls: Record<string, string> = {};

  for (const file of TARGETS) {
    const localPath = path.join(ML_DIR, file);
    if (!fs.existsSync(localPath)) {
      console.error(`  ${file} 없음 — 스킵`);
      continue;
    }

    // 1. 원본 hash
    const origBuf = fs.readFileSync(localPath);
    const origHash = sha256(origBuf);
    const origMB = (origBuf.length / 1024 / 1024).toFixed(2);

    // 2. gzip 압축 (level 9 = 최대)
    console.log(`[${file}] 압축 중... (원본 ${origMB}MB, sha256=${origHash.slice(0, 12)}...)`);
    const t0 = Date.now();
    const compressed = zlib.gzipSync(origBuf, { level: 9 });
    const compMB = (compressed.length / 1024 / 1024).toFixed(2);
    const ratio = ((1 - compressed.length / origBuf.length) * 100).toFixed(1);
    console.log(`  → ${compMB}MB (${ratio}% 축소, ${Date.now() - t0}ms)`);

    // 3. 무결성 검증 — gunzip 후 sha256 비교
    const t1 = Date.now();
    const restored = zlib.gunzipSync(compressed);
    const restoredHash = sha256(restored);
    if (restoredHash !== origHash) {
      throw new Error(`무결성 실패: ${file} 압축/해제 후 hash 불일치 (orig=${origHash}, restored=${restoredHash})`);
    }
    console.log(`  ✅ 무결성 OK (gunzip ${Date.now() - t1}ms, sha256 일치)`);

    // 4. Vercel Blob 업로드 (.onnx.gz)
    const remoteName = `ml-models/${file}.gz`;
    console.log(`  업로드 → ${remoteName}`);
    const t2 = Date.now();
    const result = await put(remoteName, compressed, {
      access: "private",
      token: TOKEN,
      contentType: "application/gzip",
      cacheControlMaxAge: 31536000,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    console.log(`  ✅ ${Date.now() - t2}ms — ${result.url}\n`);
    newUrls[file.replace(".onnx", "")] = result.url;
  }

  // 5. manifest 갱신 — 새 URL + 압축 플래그
  manifest.remote_models = {
    lowerlimit_q05: newUrls["lowerlimit_q05"],
    lowerlimit_q50: newUrls["lowerlimit_q50"],
    lowerlimit_q95: newUrls["lowerlimit_q95"],
  };
  manifest.remote_compression = "gzip";
  manifest.host = "vercel-blob";
  manifest.uploaded_at = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("=== manifest 갱신 완료 ===");
  console.log(JSON.stringify(manifest.remote_models, null, 2));
})();
