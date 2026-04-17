"""
FastAPI 예측 서버 — Railway 배포용

엔드포인트:
    GET  /health
    POST /predict    (헤더 X-API-Key 필요)

환경변수:
    ML_API_KEY      — 인증 키 (요청 헤더 X-API-Key와 매칭)
    MODEL_PATH      — 기본: models/sajung_lgbm.pkl
    PORT            — 기본: 8000 (Railway가 자동 할당)

로컬 실행:
    uvicorn serve:app --host 0.0.0.0 --port 8000
"""
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import joblib

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", str(ROOT / "models" / "sajung_lgbm.pkl")))
API_KEY = os.environ.get("ML_API_KEY", "")

if not MODEL_PATH.exists():
    raise RuntimeError(f"모델 없음: {MODEL_PATH}")

artifact = joblib.load(MODEL_PATH)
MODEL = artifact["model"]
ENCODERS = artifact["encoders"]
FEATURE_NAMES = artifact["feature_names"]
MODEL_VERSION = artifact.get("model_version", "unknown")

app = FastAPI(title="Naktal ML — 사정율 예측", version=MODEL_VERSION)


class PredictRequest(BaseModel):
    category: str
    orgName: str
    budgetRange: str
    region: str
    month: int
    year: int
    budget_log: float
    numBidders: int
    stat_avg: float
    stat_stddev: float
    stat_p25: float
    stat_p75: float
    sampleSize: int
    bidder_volatility: float
    is_sparse_org: int
    season_q: int


class PredictResponse(BaseModel):
    predicted_sajung_rate: float
    model_version: str


def require_api_key(x_api_key: Optional[str]) -> None:
    if not API_KEY:
        # 개발 환경: API_KEY 미설정 시 인증 생략
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "feature_count": len(FEATURE_NAMES),
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, x_api_key: Optional[str] = Header(None)) -> PredictResponse:
    require_api_key(x_api_key)

    d = req.model_dump()
    row = []
    for col in FEATURE_NAMES:
        v = d[col]
        if col in ENCODERS:
            try:
                row.append(int(ENCODERS[col].transform([str(v)])[0]))
            except ValueError:
                row.append(-1)  # unknown category
        else:
            row.append(v)

    pred = float(MODEL.predict([row])[0])
    # 유효 범위 클리핑 (97~103)
    pred = max(97.0, min(103.0, pred))
    return PredictResponse(
        predicted_sajung_rate=round(pred, 4),
        model_version=MODEL_VERSION,
    )
