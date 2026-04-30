"""
ML 모델 평가 지표 집계 → apps/web/ml/evaluation.json

각 모델의 학습 시 기록된 `metrics` 딕셔너리를 한 곳에 모아 /admin/model 등에서
시계열로 추적할 수 있도록 한다.

입력:
  - apps/web/ml/sajung_lgbm_v2_meta.json
  - apps/web/ml/opening/meta.json
  - apps/web/ml/participants_lgbm_meta.json (있으면)
  - apps/ml/models/*.pkl (메타 JSON에 metrics가 비어 있을 때 폴백)

출력:
  - apps/web/ml/evaluation.json (overwrite)
  - apps/web/ml/evaluation_history.jsonl (append, 주간 추이용)

사용:
    cd apps/ml
    .venv/Scripts/python.exe pipelines/evaluate_models.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import joblib  # type: ignore
except ImportError:
    joblib = None  # 메타 JSON만으로 동작 가능, .pkl 폴백 시에만 필요

ROOT = Path(__file__).resolve().parent.parent
WEB_ML = ROOT.parent / "web" / "ml"
PKL_DIR = ROOT / "models"

OUT_FILE = WEB_ML / "evaluation.json"
HISTORY_FILE = WEB_ML / "evaluation_history.jsonl"

# (display_name, meta_path, fallback_pkl)
MODELS: list[tuple[str, Path, Path | None]] = [
    (
        "sajung_v2",
        WEB_ML / "sajung_lgbm_v2_meta.json",
        PKL_DIR / "sajung_lgbm_v2.pkl",
    ),
    (
        "opening",
        WEB_ML / "opening" / "meta.json",
        PKL_DIR / "opening_lgbm.pkl",
    ),
    (
        "participants",
        WEB_ML / "participants_lgbm_meta.json",
        PKL_DIR / "participants_lgbm.pkl",
    ),
]


def load_meta(meta_path: Path) -> dict | None:
    if not meta_path.exists():
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  [WARN] {meta_path} 파싱 실패: {e}")
        return None


def load_pkl_metrics(pkl_path: Path) -> tuple[dict, str]:
    if joblib is None or not pkl_path.exists():
        return {}, ""
    try:
        payload = joblib.load(pkl_path)
        return (
            payload.get("metrics", {}) or {},
            payload.get("model_version", ""),
        )
    except Exception as e:
        print(f"  [WARN] {pkl_path} 로드 실패: {e}")
        return {}, ""


def collect() -> dict:
    now = datetime.now(timezone.utc).isoformat()
    summary: dict[str, dict] = {}
    for name, meta_path, pkl_path in MODELS:
        entry: dict = {"model": name, "evaluated_at": now}
        meta = load_meta(meta_path)
        if meta:
            entry["model_version"] = meta.get("model_version", "")
            entry["metrics"] = meta.get("metrics", {}) or {}
            entry["feature_count"] = len(meta.get("feature_names") or [])
            entry["source"] = str(meta_path.relative_to(WEB_ML.parent))
        if not entry.get("metrics") and pkl_path is not None:
            metrics, ver = load_pkl_metrics(pkl_path)
            if metrics:
                entry["metrics"] = metrics
                if not entry.get("model_version"):
                    entry["model_version"] = ver
                entry["source"] = str(pkl_path.relative_to(ROOT.parent))
        if "metrics" not in entry:
            entry["status"] = "missing"
        else:
            entry["status"] = "ok"
        summary[name] = entry
        ms = entry.get("metrics", {})
        ver = entry.get("model_version", "?")
        ms_str = ", ".join(f"{k}={v:.4f}" for k, v in ms.items()) if ms else "(no metrics)"
        print(f"  - {name} [{ver}]: {ms_str}")
    return {"generated_at": now, "models": summary}


def main() -> int:
    print("=== Naktal ML evaluate_models ===")
    if not WEB_ML.exists():
        print(f"ERROR: {WEB_ML} 없음", file=sys.stderr)
        return 1
    result = collect()
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n저장: {OUT_FILE}")

    # 주간 추이 (jsonl append). 한 줄 = 한 실행분.
    with open(HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(result, ensure_ascii=False) + "\n")
    print(f"이력 추가: {HISTORY_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
