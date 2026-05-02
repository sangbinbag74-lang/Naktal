import * as fs from "fs";
import * as path from "path";

export interface ModelEvalEntry {
  model: string;
  evaluated_at: string;
  model_version?: string;
  metrics?: Record<string, number>;
  feature_count?: number;
  source?: string;
  status: "ok" | "missing";
}

export interface ModelEval {
  generated_at: string;
  models: Record<string, ModelEvalEntry>;
}

export interface DriftPoint {
  generated_at: string;
  values: Record<string, Record<string, number>>;
}

const ML_DIR = path.join(process.cwd(), "ml");
const EVAL_FILE = path.join(ML_DIR, "evaluation.json");
const HISTORY_FILE = path.join(ML_DIR, "evaluation_history.jsonl");

export function loadEvaluation(): ModelEval | null {
  try {
    if (!fs.existsSync(EVAL_FILE)) return null;
    return JSON.parse(fs.readFileSync(EVAL_FILE, "utf-8")) as ModelEval;
  } catch {
    return null;
  }
}

export function loadDriftHistory(maxPoints = 26): DriftPoint[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const lines = fs.readFileSync(HISTORY_FILE, "utf-8").trim().split("\n").filter(Boolean);
    const recent = lines.slice(-maxPoints);
    const out: DriftPoint[] = [];
    for (const l of recent) {
      try {
        const r = JSON.parse(l) as ModelEval;
        const values: Record<string, Record<string, number>> = {};
        for (const [name, entry] of Object.entries(r.models)) {
          if (entry.metrics) values[name] = entry.metrics;
        }
        out.push({ generated_at: r.generated_at, values });
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}
