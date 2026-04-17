"""
LightGBM 모델 → ONNX 변환 + Encoders → JSON 추출

출력:
    apps/ml/models/sajung_lgbm.onnx    (Node.js onnxruntime-node용)
    apps/ml/models/sajung_encoders.json (LabelEncoder 매핑, sklearn 의존성 제거)

실행:
    cd apps/ml
    .venv/Scripts/python pipelines/export_onnx.py
"""
from pathlib import Path
import json
import sys
import joblib
from onnxmltools import convert_lightgbm
from onnxconverter_common import FloatTensorType

# LightGBM 트리가 깊을 때 재귀 한계 초과 방지
sys.setrecursionlimit(100000)

ROOT = Path(__file__).resolve().parent.parent
PKL_PATH = ROOT / "models" / "sajung_lgbm.pkl"
ONNX_PATH = ROOT / "models" / "sajung_lgbm.onnx"
ENCODERS_PATH = ROOT / "models" / "sajung_encoders.json"


def main() -> None:
    print(f"로드: {PKL_PATH}")
    artifact = joblib.load(PKL_PATH)
    model = artifact["model"]
    encoders = artifact["encoders"]
    feature_names = artifact["feature_names"]
    categorical_cols = artifact["categorical_cols"]
    model_version = artifact.get("model_version", "sajung-lgbm-v1.0")

    print(f"피처 수: {len(feature_names)}")
    print(f"범주형: {categorical_cols}")

    # 1. LightGBM → ONNX
    initial_type = [("input", FloatTensorType([None, len(feature_names)]))]
    print("LightGBM → ONNX 변환 중...")
    onnx_model = convert_lightgbm(
        model,
        initial_types=initial_type,
        target_opset=12,
        zipmap=False,
    )
    with open(ONNX_PATH, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_mb = ONNX_PATH.stat().st_size / 1024 / 1024
    print(f"ONNX 저장: {ONNX_PATH} ({size_mb:.2f} MB)")

    # 2. LabelEncoder → JSON dict
    encoders_dict = {}
    for col, le in encoders.items():
        encoders_dict[col] = {str(cls): int(idx) for idx, cls in enumerate(le.classes_)}

    metadata = {
        "encoders": encoders_dict,
        "feature_names": feature_names,
        "categorical_cols": categorical_cols,
        "model_version": model_version,
    }
    with open(ENCODERS_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    size_kb = ENCODERS_PATH.stat().st_size / 1024
    print(f"Encoders 저장: {ENCODERS_PATH} ({size_kb:.0f} KB)")

    # 3. 검증: ONNX 모델로 스모크 테스트
    print("\n스모크 테스트 (ONNX 로드 + 1회 예측)...")
    import onnxruntime as ort
    import numpy as np

    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    sample = {
        "category": "시설공사",
        "orgName": "한국농어촌공사",
        "budgetRange": "1억-3억",
        "region": "전북",
        "month": 6,
        "year": 2026,
        "budget_log": 18.5,
        "numBidders": 30,
        "stat_avg": 99.8,
        "stat_stddev": 1.2,
        "stat_p25": 99.0,
        "stat_p75": 100.5,
        "sampleSize": 50,
        "bidder_volatility": 0.012,
        "is_sparse_org": 0,
        "season_q": 2,
    }
    row = []
    for col in feature_names:
        v = sample[col]
        if col in categorical_cols:
            row.append(float(encoders_dict[col].get(str(v), -1)))
        else:
            row.append(float(v))
    tensor = np.array([row], dtype=np.float32)
    inputs = {session.get_inputs()[0].name: tensor}
    out = session.run(None, inputs)
    pred = float(out[0][0][0])
    print(f"입력: {sample}")
    print(f"ONNX 예측: {pred:.4f}%")
    print(f"(predict_test.py에서 나왔던 99.9566%와 ±0.0001 일치해야 함)")


if __name__ == "__main__":
    main()
