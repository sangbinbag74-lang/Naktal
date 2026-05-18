"""
박상빈님 5/17 명시 — sajung_lgbm_v2.pkl (1.84M) → ONNX 변환
본 ONNX = apps/web/ml/sajung_lgbm_v2.onnx 덮어쓰기 (옛 1.16M ONNX 교체)
"""
import sys
import json
from pathlib import Path
import joblib
import numpy as np

sys.setrecursionlimit(100000)

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"

payload = joblib.load(MODEL_DIR / "sajung_lgbm_v2.pkl")
model = payload["model"]
feat = payload["feature_names"]
encoders = payload.get("encoders", {})
cat_cols = payload.get("categorical_cols", list(encoders.keys()))
n = len(feat)
print(f"v2 features: {n}, model: {type(model).__name__}")

# LightGBM → ONNX
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

initial_types = [("input", FloatTensorType([None, n]))]
onnx_model = convert_lightgbm(model, initial_types=initial_types, target_opset=14, zipmap=False)

out = OUT_DIR / "sajung_lgbm_v2.onnx"
with open(out, "wb") as f:
    f.write(onnx_model.SerializeToString())
print(f"[OK] {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")

# meta json (encoders + categorical_cols)
enc_out = {}
for k, le in encoders.items():
    if hasattr(le, "classes_"):
        enc_out[k] = {str(c): i for i, c in enumerate(le.classes_)}
    elif isinstance(le, dict):
        enc_out[k] = {str(c): i for c, i in le.items()}
    else:
        enc_out[k] = {}

meta = {
    "feature_names": feat,
    "categorical_cols": cat_cols,
    "numeric_cols": payload.get("numeric_cols", []),
    "encoders": enc_out,
    "model_version": "sajung_lgbm_v2-1.84M-2026-05-17",
    "metrics": payload.get("metrics", {}),
}
with open(OUT_DIR / "sajung_lgbm_v2_meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False)
print(f"meta: sajung_lgbm_v2_meta.json")
