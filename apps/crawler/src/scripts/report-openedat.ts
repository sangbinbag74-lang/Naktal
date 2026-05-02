import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    const m = v.match(/^"([^"]*)"|^'([^']*)'/);
    if (m) v = (m[1] ?? m[2]) as string;
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error("no db");
}
const STATE = path.resolve(__dirname, ".report-openedat-state.json");
function fmt(min: number): string {
  if (min < 1) return "<1m";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();
  const r = await c.query('SELECT COUNT(*)::int AS total, COUNT("openedAt")::int AS filled FROM "BidResult"');
  const t = r.rows[0].total, f = r.rows[0].filled;
  const missing = t - f;
  const now = Date.now();

  let prev: { ts: number; missing: number } | null = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, "utf-8")); } catch {}

  let etaStr = "측정중";
  let delta = 0;
  if (prev && prev.missing > missing) {
    delta = prev.missing - missing;
    const elapsedMin = (now - prev.ts) / 60000;
    const ratePerMin = delta / elapsedMin;
    if (ratePerMin > 0) {
      const remainMin = missing / ratePerMin;
      etaStr = `${fmt(remainMin)} 남음`;
    } else {
      etaStr = "정체";
    }
  } else if (prev) {
    etaStr = "Δ=0";
  }
  fs.writeFileSync(STATE, JSON.stringify({ ts: now, missing }));
  const hhmm = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  const lines = [
    `**${hhmm} 자세히:**`,
    ``,
    `| 프로세스 | 진행 | Δ | 단독 남은 |`,
    `|---|---|---|---|`,
    `| **recollect-rlopeng** | 채움 ${f.toLocaleString()} / ${t.toLocaleString()} (${(f/t*100).toFixed(2)}%) 결측 ${missing.toLocaleString()} | +${delta.toLocaleString()} | ${etaStr} |`,
    `<<<EVENT_END>>>`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
  c.release(); await pool.end();
})().catch(e => { process.stdout.write(`| ERR | ${e.message} |\n`); process.exit(1); });
