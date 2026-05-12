import * as fs from "fs";
import * as path from "path";
const filePath = path.resolve(__dirname, "../../../../verify-totalcount-result.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
console.log("=== verify-totalcount-result.json (생성:", data.generatedAt, ") ===");
console.log(`API 합: ${data.summary.totalApi.toLocaleString()}`);
console.log(`DB 합:  ${data.summary.totalDb.toLocaleString()}`);
console.log(`매칭률: ${(data.summary.matchRate*100).toFixed(2)}%`);
console.log(`미완료 ym: ${data.summary.incompleteCount} 개`);
console.log(`누락 추정: ${data.summary.missingEstimate.toLocaleString()}`);
console.log("");
console.log("=== 미완료 92 ym 분포 ===");
// 매칭률 분포
const buckets = { "0-25%": 0, "25-50%": 0, "50-65%": 0, "65-80%": 0 };
for (const it of data.incomplete) {
  if (it.ratio < 25) buckets["0-25%"]++;
  else if (it.ratio < 50) buckets["25-50%"]++;
  else if (it.ratio < 65) buckets["50-65%"]++;
  else buckets["65-80%"]++;
}
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v} ym`);
console.log("");
// 연도별 분포
console.log("=== 연도별 미완료 ym ===");
const byYear: Record<string, number> = {};
const missingByYear: Record<string, number> = {};
for (const it of data.incomplete) {
  const y = it.ym.slice(0, 4);
  byYear[y] = (byYear[y] || 0) + 1;
  missingByYear[y] = (missingByYear[y] || 0) + it.missing;
}
const years = Object.keys(byYear).sort();
for (const y of years) {
  console.log(`  ${y}: ${byYear[y]} ym, 누락 ${missingByYear[y].toLocaleString()}`);
}
console.log("");
// 가장 심각한 ym (매칭률 낮은 순)
console.log("=== 매칭률 < 25% ym (전수 재수집 필요) ===");
const worst = data.incomplete.filter((x: any) => x.ratio < 25).sort((a:any,b:any) => a.ratio - b.ratio);
for (const it of worst) {
  console.log(`  ${it.ym}: ${it.ratio.toFixed(1)}% (${it.db}/${it.api}, 누락 ${it.missing.toLocaleString()})`);
}
