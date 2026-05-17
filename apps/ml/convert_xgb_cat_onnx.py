"""
XGBoost + CatBoost → ONNX 변환 (박상빈님 5/17 명시 — v2 + xgb + cat 가중평균 운영)
"""
import sys
import json
from pathlib import Path
import joblib
import numpy as np

sys.setrecursionlimit(20000)

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def convert_xgboost():
    print("[XGBoost]")
    payload = joblib.load(MODEL_DIR / "sajung_xgboost.pkl")
    wrapper = payload["model"]  # XGBRegressor wrapper
    feat = payload["feature_names"]
    encoders = payload.get("encoders", {})
    n = len(feat)
    print(f"  features: {n}")

    # inner Booster 추출 — onnxmltools 는 string feature_names 를 int 로 parse 시도 → ValueError
    inner = wrapper.get_booster() if hasattr(wrapper, "get_booster") else wrapper
    inner.feature_names = [f"f{i}" for i in range(n)]
    print(f"  inner booster feature_names overridden: {inner.feature_names[:3]}...")

    # XGBoost → ONNX via onnxmltools (inner booster 직접 전달)
    from onnxmltools import convert_xgboost as cvx
    from onnxmltools.convert.common.data_types import FloatTensorType
    initial_types = [("input", FloatTensorType([None, n]))]
    onnx_model = cvx(inner, initial_types=initial_types, target_opset=14)
    out = OUT_DIR / "sajung_xgboost.onnx"
    with open(out, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"  [OK] {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")

    # encoders JSON
    enc_out = {}
    for k, le in encoders.items():
        enc_out[k] = list(le.classes_) if hasattr(le, "classes_") else []
    with open(OUT_DIR / "sajung_xgboost_meta.json", "w", encoding="utf-8") as f:
        json.dump({"feature_names": feat, "encoders": enc_out}, f, ensure_ascii=False)
    print(f"  meta: sajung_xgboost_meta.json")


def convert_catboost():
    print("\n[CatBoost]")
    payload = joblib.load(MODEL_DIR / "sajung_catboost.pkl")
    model = payload["model"]
    feat = payload["feature_names"]
    encoders = payload.get("encoders", {})
    print(f"  features: {len(feat)}")

    out = OUT_DIR / "sajung_catboost.onnx"
    model.save_model(str(out), format="onnx",
                     export_parameters={"onnx_domain": "ai.catboost",
                                        "onnx_model_version": 1,
                                        "onnx_doc_string": "naktal sajung catboost",
                                        "onnx_graph_name": "sajung_catboost"})
    print(f"  [OK] {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")

    enc_out = {}
    for k, le in encoders.items():
        enc_out[k] = list(le.classes_) if hasattr(le, "classes_") else []
    with open(OUT_DIR / "sajung_catboost_meta.json", "w", encoding="utf-8") as f:
        json.dump({"feature_names": feat, "encoders": enc_out}, f, ensure_ascii=False)
    print(f"  meta: sajung_catboost_meta.json")


if __name__ == "__main__":
    try:
        convert_xgboost()
    except Exception as e:
        print(f"  [XGB ERROR] {e}")
        import traceback; traceback.print_exc()
    try:
        convert_catboost()
    except Exception as e:
        print(f"  [CAT ERROR] {e}")
        import traceback; traceback.print_exc()
