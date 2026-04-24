"""
3개 모델 → ONNX 일괄 변환

입력: apps/ml/models/*.pkl (joblib)
출력: apps/web/ml/*.onnx + apps/web/ml/*_encoders.json

변환 대상:
  - sajung_lgbm_v2.pkl  → sajung_lgbm_v2.onnx
  - opening_lgbm.pkl    → opening_lgbm.onnx (15개 Booster 각각)
  - participants_lgbm.pkl → participants_lgbm.onnx

실행:
    cd apps/ml
    .venv\\Scripts\\activate
    python convert_onnx.py
"""
import sys
import json
from pathlib import Path
import joblib
import numpy as np
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
OUT_DIR = ROOT.parent / "web" / "ml"


def convert_single(model_path: Path, out_name: str, n_features: int | None = None) -> None:
    """단일 LightGBM booster → ONNX"""
    print(f"\n[{out_name}] {model_path}")
    payload = joblib.load(model_path)
    booster = payload["model"]
    features = payload["feature_names"]
    n = n_features or len(features)

    initial_types = [("input", FloatTensorType([None, n]))]
    onnx_model = convert_lightgbm(booster, initial_types=initial_types, target_opset=14)

    out_path = OUT_DIR / f"{out_name}.onnx"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"  ✅ ONNX: {out_path} ({out_path.stat().st_size / 1024 / 1024:.2f} MB)")

    # 인코더 JSON 출력
    # encoders: {col: {class_name: index}} 형식 (기존 ml-predict route 호환)
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
    print(f"  ✅ Meta: {meta_path}")


def convert_opening() -> None:
    """Opening model: 15개 booster → 15개 ONNX 파일 (또는 하나로 합침)"""
    model_path = MODEL_DIR / "opening_lgbm.pkl"
    if not model_path.exists():
        print(f"SKIP: {model_path} 없음")
        return

    print(f"\n[opening_lgbm] {model_path}")
    payload = joblib.load(model_path)
    boosters = payload["boosters"]
    features = payload["feature_names"]
    n = len(features)
    n_numbers = payload.get("n_numbers", 15)

    # 15개 각각 ONNX 변환 + 하나의 폴더에 저장
    opening_dir = OUT_DIR / "opening"
    opening_dir.mkdir(parents=True, exist_ok=True)
    initial_types = [("input", FloatTensorType([None, n]))]

    for i, booster in enumerate(boosters):
        if booster is None:
            print(f"  sel_{i+1}: skip (null booster)")
            continue
        onnx_model = convert_lightgbm(booster, initial_types=initial_types, target_opset=14)
        out_path = opening_dir / f"sel_{i+1}.onnx"
        with open(out_path, "wb") as f:
            f.write(onnx_model.SerializeToString())

    # 메타 저장: {col: {class_name: index}} 형식
    encoders_dict = {
        col: {str(c): int(i) for i, c in enumerate(le.classes_)}
        for col, le in payload["encoders"].items()
    }
    meta = {
        "feature_names": features,
        "categorical_cols": payload.get("categorical_cols", []),
        "numeric_cols": payload.get("numeric_cols", []),
        "encoders": encoders_dict,
        "n_numbers": n_numbers,
        "model_version": payload.get("model_version", ""),
        "metrics": payload.get("metrics", {}),
    }
    meta_path = opening_dir / "meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    total_size = sum(p.stat().st_size for p in opening_dir.glob("*.onnx"))
    print(f"  ✅ 15개 ONNX → {opening_dir} (합계 {total_size / 1024 / 1024:.2f} MB)")


def main():
    # 1. 사정율 v2
    sajung_path = MODEL_DIR / "sajung_lgbm_v2.pkl"
    if sajung_path.exists():
        convert_single(sajung_path, "sajung_lgbm_v2")
    else:
        print(f"SKIP sajung v2: {sajung_path} 없음")

    # 2. Opening (15 boosters)
    convert_opening()

    # 3. 참여자
    participants_path = MODEL_DIR / "participants_lgbm.pkl"
    if participants_path.exists():
        convert_single(participants_path, "participants_lgbm")
    else:
        print(f"SKIP participants: {participants_path} 없음")

    print("\n=== ONNX 변환 완료 ===")
    print(f"출력 경로: {OUT_DIR}")


if __name__ == "__main__":
    main()
