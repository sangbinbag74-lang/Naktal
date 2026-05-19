"""박상빈님 5/19 — B-q70 (sajung_quantile_q70_new.pkl) → ONNX 변환

운영 적용용: apps/web/ml/sajung_quantile_q70.onnx + meta json.
"""
import sys, json
from pathlib import Path
import joblib
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

sys.setrecursionlimit(20000)

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"

model_path = MODEL_DIR / "sajung_quantile_q70_new.pkl"
out_name = "sajung_quantile_q70"

print(f"[B-q70] 로드: {model_path}")
payload = joblib.load(model_path)
booster = payload["model"]
features = payload["feature_names"]
n = len(features)
print(f"  피처 {n}개, model_version: {payload.get('model_version', '?')}")

print(f"[B-q70] ONNX 변환…")
initial_types = [("input", FloatTensorType([None, n]))]
onnx_model = convert_lightgbm(booster, initial_types=initial_types, target_opset=14)

out_path = OUT_DIR / f"{out_name}.onnx"
OUT_DIR.mkdir(parents=True, exist_ok=True)
with open(out_path, "wb") as f:
    f.write(onnx_model.SerializeToString())
print(f"  [OK] ONNX: {out_path} ({out_path.stat().st_size / 1024 / 1024:.2f} MB)")

encoders_dict = {}
for col, le in payload["encoders"].items():
    encoders_dict[col] = {str(c): int(i) for i, c in enumerate(le.classes_)}
meta = {
    "feature_names": features,
    "categorical_cols": payload.get("categorical_cols", []),
    "numeric_cols": payload.get("numeric_cols", []),
    "encoders": encoders_dict,
    "model_version": payload.get("model_version", ""),
    "metrics": payload.get("metrics", {}),
}
meta_path = OUT_DIR / f"{out_name}_meta.json"
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"  [OK] Meta: {meta_path}")
print("\n=== B-q70 ONNX 변환 완료 ===")
