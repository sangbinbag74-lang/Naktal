"""박상빈님 5/21 — 박스권 ML B q40/q70 ONNX 변환 (K-2 운영 적용)

산출물:
  apps/web/ml/sajung_quantile_q40.onnx
  apps/web/ml/sajung_quantile_q40_meta.json
  apps/web/ml/sajung_quantile_q70.onnx
  apps/web/ml/sajung_quantile_q70_meta.json

박상빈님 의도: 사용자별 q40~q70 deterministic 박스권 안 다양화.
"""
import sys, io, json
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
import joblib

sys.setrecursionlimit(100000)

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
WEB_ML_DIR = ROOT.parent / "web" / "ml"
WEB_ML_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = [
    ("sajung_quantile_q40_new.pkl", "sajung_quantile_q40"),
    ("sajung_quantile_q70_new.pkl", "sajung_quantile_q70"),
]


def convert(pkl_name: str, onnx_name: str):
    from onnxmltools import convert_lightgbm
    from onnxconverter_common import FloatTensorType
    pkl = MODEL_DIR / pkl_name
    if not pkl.exists():
        print(f"❌ 누락: {pkl}")
        return
    artifact = joblib.load(pkl)
    model = artifact["model"]
    feature_names = artifact["feature_names"]
    categorical_cols = artifact.get("categorical_cols", [])
    encoders = artifact.get("encoders", {})
    model_version = artifact.get("model_version", onnx_name)

    print(f"\n[{onnx_name}] LightGBM → ONNX 변환…")
    initial_type = [("input", FloatTensorType([None, len(feature_names)]))]
    onnx_model = convert_lightgbm(model, initial_types=initial_type, target_opset=12, zipmap=False)
    onnx_path = WEB_ML_DIR / f"{onnx_name}.onnx"
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_mb = onnx_path.stat().st_size / 1024 / 1024
    print(f"  저장: {onnx_path.name} ({size_mb:.2f} MB)")

    encoders_dict = {col: {str(cls): int(idx) for idx, cls in enumerate(le.classes_)} for col, le in encoders.items()}
    meta_path = WEB_ML_DIR / f"{onnx_name}_meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "feature_names": feature_names,
            "categorical_cols": categorical_cols,
            "encoders": encoders_dict,
            "model_version": model_version,
        }, f, ensure_ascii=False, indent=2)
    print(f"  메타: {meta_path.name}")


def main():
    print("=" * 60)
    print("박상빈님 5/21 — K-2 박스권 ML B q40/q70 ONNX 변환")
    print("=" * 60)
    for pkl_name, onnx_name in TARGETS:
        convert(pkl_name, onnx_name)

    # 스모크 테스트
    print("\n[스모크 테스트]")
    import onnxruntime as ort
    import numpy as np
    for _, name in TARGETS:
        onnx_path = WEB_ML_DIR / f"{name}.onnx"
        if not onnx_path.exists():
            continue
        session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        meta = json.load(open(WEB_ML_DIR / f"{name}_meta.json", encoding="utf-8"))
        n_features = len(meta["feature_names"])
        sample = np.zeros((1, n_features), dtype=np.float32)
        pred = session.run(None, {"input": sample})[0]
        print(f"  {name}: shape {pred.shape} = {pred[0][0]:.4f}")


if __name__ == "__main__":
    main()
