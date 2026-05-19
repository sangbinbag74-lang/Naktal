"""quantile pkl에서 meta json 생성 — ensemble route 호환 형식"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import joblib

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"

for name in ["sajung_quantile_q05", "sajung_quantile_q50", "sajung_quantile_q95"]:
    pkl = MODEL_DIR / f"{name}.pkl"
    if not pkl.exists():
        print(f"SKIP {name}")
        continue
    payload = joblib.load(pkl)
    encoders = {}
    for col, le in payload.get("encoders", {}).items():
        # LabelEncoder → dict {className: idx}
        try:
            encoders[col] = {str(c): int(i) for i, c in enumerate(le.classes_)}
        except Exception:
            encoders[col] = {}
    meta = {
        "feature_names": payload.get("feature_names", []),
        "categorical_cols": payload.get("categorical_cols", list(payload.get("encoders", {}).keys())),
        "numeric_cols": payload.get("numeric_cols", []),
        "encoders": encoders,
        "model_version": payload.get("model_version", name),
    }
    out_path = OUT_DIR / f"{name}_meta.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"[OK] {out_path} — {len(meta['feature_names'])} 피처 / {len(meta['categorical_cols'])} 범주")
