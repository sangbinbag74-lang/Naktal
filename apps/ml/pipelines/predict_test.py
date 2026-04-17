"""
학습 모델 smoke test
실행: python pipelines/predict_test.py
"""
from pathlib import Path
import joblib

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "sajung_lgbm.pkl"

artifact = joblib.load(MODEL_PATH)
model = artifact["model"]
encoders = artifact["encoders"]
feature_names = artifact["feature_names"]

# 테스트 입력
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

# 범주형 인코딩
row = []
for col in feature_names:
    v = sample[col]
    if col in encoders:
        try:
            row.append(int(encoders[col].transform([str(v)])[0]))
        except Exception:
            row.append(-1)
    else:
        row.append(v)

pred = model.predict([row])[0]
print(f"입력: {sample}")
print(f"예측 사정율: {pred:.4f}%")
