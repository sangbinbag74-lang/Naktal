"""
Vercel Python Function — LightGBM 사정율 예측

엔드포인트:
    GET  /api/ml-predict  → health check
    POST /api/ml-predict  → 예측 (헤더 X-API-Key 필요, 환경변수 ML_API_KEY 설정 시)

입력 (JSON):
    { category, orgName, budgetRange, region, month, year,
      budget_log, numBidders, stat_avg, stat_stddev, stat_p25, stat_p75,
      sampleSize, bidder_volatility, is_sparse_org, season_q }

출력:
    { predicted_sajung_rate: float, model_version: str }
"""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import joblib

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "sajung_lgbm.pkl"
API_KEY = os.environ.get("ML_API_KEY", "")

# 콜드 스타트 시 1회 로드
_artifact = joblib.load(MODEL_PATH)
_MODEL = _artifact["model"]
_ENCODERS = _artifact["encoders"]
_FEATURE_NAMES = _artifact["feature_names"]
_MODEL_VERSION = _artifact.get("model_version", "unknown")


def _predict(data: dict) -> float:
    row = []
    for col in _FEATURE_NAMES:
        v = data.get(col)
        if col in _ENCODERS:
            try:
                row.append(int(_ENCODERS[col].transform([str(v)])[0]))
            except (ValueError, KeyError):
                row.append(-1)
        else:
            row.append(v)
    pred = float(_MODEL.predict([row])[0])
    return max(97.0, min(103.0, pred))


class handler(BaseHTTPRequestHandler):
    def _write(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._write(200, {
            "status": "ok",
            "model_version": _MODEL_VERSION,
            "feature_count": len(_FEATURE_NAMES),
        })

    def do_POST(self) -> None:
        if API_KEY and self.headers.get("X-API-Key") != API_KEY:
            return self._write(401, {"error": "invalid api key"})

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
        except Exception:
            return self._write(400, {"error": "invalid json"})

        try:
            pred = _predict(data)
        except Exception as e:
            return self._write(500, {"error": f"prediction failed: {type(e).__name__}"})

        self._write(200, {
            "predicted_sajung_rate": round(pred, 4),
            "model_version": _MODEL_VERSION,
        })

    def log_message(self, format, *args):
        # 과도한 로그 방지
        pass
