"""FastAPI ML prediction server.

Run locally:
    uvicorn api:app --reload --port 8000

Endpoints:
    POST /predict/bid-rate   x-api-key header required
    POST /predict/preeprice  x-api-key header required
"""

from __future__ import annotations

import os
import sys
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load env
_web_root = os.path.join(os.path.dirname(__file__), "..", "web")
load_dotenv(os.path.join(_web_root, ".env.local"))

sys.path.insert(0, os.path.dirname(__file__))
from models.bid_rate_model import BidRatePredictor
from models.preeprice_stats import (
    DISCLAIMER,
    compute_preeprice_recommendation,
    fetch_similar_announcements,
)

# ------------------------------------------------------------------ #
# App setup
# ------------------------------------------------------------------ #
app = FastAPI(title="Naktal ML API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://naktal.ai", "http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

ML_API_KEY = os.environ.get("ML_API_KEY", "")

# 모델 로드 (최초 요청 시 lazy load)
_predictor: BidRatePredictor | None = None


def _get_predictor() -> BidRatePredictor:
    global _predictor
    if _predictor is None:
        _predictor = BidRatePredictor.load()
    return _predictor


def _check_api_key(request: Request) -> None:
    if not ML_API_KEY:
        raise HTTPException(status_code=500, detail="ML_API_KEY not configured")
    key = request.headers.get("x-api-key", "")
    if key != ML_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ------------------------------------------------------------------ #
# Schemas
# ------------------------------------------------------------------ #
class BidRateRequest(BaseModel):
    budget: int
    category: str
    region: str
    org_name: str
    num_bidders: int | None = None
    deadline: str  # ISO 8601


class BidRateResponse(BaseModel):
    recommended_rate: float
    confidence_range: list[float]
    similar_cases: int
    warning: str | None


class PreepriceRequest(BaseModel):
    category: str
    budget: int
    num_bidders_est: int


class PreepriceResponse(BaseModel):
    combos: list[dict[str, Any]]
    sample_size: int
    disclaimer: str


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #
@app.post("/predict/bid-rate", response_model=BidRateResponse)
async def predict_bid_rate(body: BidRateRequest, request: Request) -> BidRateResponse:
    _check_api_key(request)
    try:
        predictor = _get_predictor()
        result = predictor.predict(body.model_dump())
        return BidRateResponse(**result)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="모델 파일이 없습니다. train.py를 먼저 실행해 주세요.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/preeprice", response_model=PreepriceResponse)
async def predict_preeprice(body: PreepriceRequest, request: Request) -> PreepriceResponse:
    _check_api_key(request)

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if supabase_url and supabase_key:
        raw_data = fetch_similar_announcements(
            supabase_url, supabase_key,
            body.category, body.budget,
        )
    else:
        raw_data = []

    result = compute_preeprice_recommendation(
        raw_data,
        body.category,
        body.budget,
        body.num_bidders_est,
    )
    return PreepriceResponse(**result)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
