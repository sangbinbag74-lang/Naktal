"""박상빈님 5/19 — B-q60, B-q80 ONNX 변환 (cat3 운영 적용용)"""
import sys, json
from pathlib import Path
import joblib
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType
sys.setrecursionlimit(20000)

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"

for q in ["q60", "q80"]:
    model_path = MODEL_DIR / f"sajung_quantile_{q}_new.pkl"
    out_name = f"sajung_quantile_{q}"
    payload = joblib.load(model_path)
    booster = payload["model"]
    features = payload["feature_names"]
    n = len(features)
    initial_types = [("input", FloatTensorType([None, n]))]
    onnx_model = convert_lightgbm(booster, initial_types=initial_types, target_opset=14)
    out_path = OUT_DIR / f"{out_name}.onnx"
    with open(out_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"[OK] {out_path} ({out_path.stat().st_size / 1024 / 1024:.2f} MB)")
    encoders_dict = {col: {str(c): int(i) for i, c in enumerate(le.classes_)} for col, le in payload["encoders"].items()}
    meta = {
        "feature_names": features,
        "categorical_cols": payload.get("categorical_cols", []),
        "numeric_cols": payload.get("numeric_cols", []),
        "encoders": encoders_dict,
        "model_version": payload.get("model_version", out_name),
    }
    with open(OUT_DIR / f"{out_name}_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"[OK] Meta: {OUT_DIR / f'{out_name}_meta.json'}")
