// lowerlimit 3개 ONNX → Vercel Blob 업로드 + manifest 갱신
// 실행: pnpm --filter @naktal/crawler ts-node src/scripts/upload-models-to-blob.ts
import { put } from "@vercel/blob";
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

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 없음");

const ML_DIR = path.resolve(__dirname, "../../../web/ml");
const FILES = [
  { local: "lowerlimit_q05.onnx", remote: "ml-models/lowerlimit_q05.onnx" },
  { local: "lowerlimit_q50.onnx", remote: "ml-models/lowerlimit_q50.onnx" },
  { local: "lowerlimit_q95.onnx", remote: "ml-models/lowerlimit_q95.onnx" },
];

(async () => {
  console.log("=== Vercel Blob 업로드 ===\n");
  const urls: Record<string, string> = {};
  for (const f of FILES) {
    const localPath = path.join(ML_DIR, f.local);
    if (!fs.existsSync(localPath)) {
      console.error(`  ${f.local} 없음 — 스킵`);
      continue;
    }
    const buf = fs.readFileSync(localPath);
    const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
    console.log(`업로드: ${f.local} (${sizeMB} MB)`);
    const t0 = Date.now();
    const result = await put(f.remote, buf, {
      access: "private",
      token: TOKEN,
      contentType: "application/octet-stream",
      cacheControlMaxAge: 31536000,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    urls[f.local.replace(".onnx", "")] = result.url;
    console.log(`  ✅ ${elapsed}s — ${result.url}`);
  }

  // manifest 갱신
  console.log("\n=== manifest 갱신 ===");
  const manifestPath = path.join(ML_DIR, "ensemble_manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  manifest.remote_models = {
    lowerlimit_q05: urls["lowerlimit_q05"],
    lowerlimit_q50: urls["lowerlimit_q50"],
    lowerlimit_q95: urls["lowerlimit_q95"],
  };
  manifest.host = "vercel-blob";
  manifest.uploaded_at = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ${manifestPath} 갱신 완료\n`);
  for (const [k, v] of Object.entries(urls)) console.log(`  ${k}: ${v}`);
})();
