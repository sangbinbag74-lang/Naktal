"""박상빈님 5/19 — B-q70 단독 vs B-q70 + 음수미러 sigma 0.03 측정.

4 지표: 부적격율 / 1위±0.05%p / 진입±0.5%p / 진입±1.0%p.
산수상 약 30초.
"""
import sys, io, time, json
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import psycopg2

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"


def load_env():
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("DIRECT_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")


def predict_one(model_path, df_in):
    payload = joblib.load(model_path)
    booster = payload["model"]
    features = payload["feature_names"]
    categorical = payload.get("categorical_cols", [])
    encoders = payload.get("encoders", {})
    X = pd.DataFrame()
    for f in features:
        X[f] = df_in[f] if f in df_in.columns else 0
    for col in categorical:
        if col in encoders:
            le = encoders[col]
            mapping = {v: i for i, v in enumerate(le.classes_)}
            X[col] = X[col].fillna("").astype(str).map(mapping).fillna(0).astype(int)
        else:
            X[col] = 0
    return booster.predict(X.values)


def main():
    print(f"[{time.strftime('%H:%M:%S')}] DB 조회…", flush=True)
    conn = psycopg2.connect(load_env())
    cur = conn.cursor()
    cur.execute("""
        SELECT a.id, a.category, a.budget::float8,
               a."bsisAmt"::float8, a."aValueAmt"::float8, a."aValueTotal"::float8,
               a."sucsfbidLwltRate"::float8, a."orgName", a.region, a.deadline,
               br."finalPrice"::float8, br."bidRate"::float8, br."numBidders"
        FROM "Announcement" a
        INNER JOIN "BidResult" br ON br."annId" = a."konepsId"
        WHERE a.deadline >= '2025-01-01' AND a.deadline < '2026-05-19'
          AND (a.category LIKE '%공사%' OR a.category = '시설공사')
          AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
          AND a."bsisAmt" > 0 AND a."sucsfbidLwltRate" > 0
          AND br."finalPrice" > 0 AND br."bidRate" > 0
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()

    df = pd.DataFrame(rows, columns=[
        "id", "category", "budget", "bsisAmt", "aValueAmt", "aValueTotal",
        "sucsfbidLwltRate", "orgName", "region", "deadline",
        "finalPrice", "bidRate", "numBidders"
    ])
    for c in ["budget", "bsisAmt", "aValueAmt", "aValueTotal", "sucsfbidLwltRate", "finalPrice", "bidRate"]:
        df[c] = df[c].astype(float).fillna(0)
    df["lwlt"] = df["sucsfbidLwltRate"]
    df["actualSajung"] = (df["finalPrice"] / (df["bidRate"] / 100) / df["bsisAmt"]) * 100
    print(f"[{time.strftime('%H:%M:%S')}] 표본 {len(df):,}건", flush=True)

    print(f"[{time.strftime('%H:%M:%S')}] B-q70 추론…", flush=True)
    bq70 = predict_one(MODEL_DIR / "sajung_quantile_q70_new.pkl", df)
    print(f"  B-q70 평균: {bq70.mean():.3f}%", flush=True)

    rng = np.random.default_rng(42)
    noise_003 = np.abs(rng.normal(0, 0.03, len(df)))
    bq70_n03 = bq70 + noise_003

    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100
    aValue = df["aValueTotal"].values
    bsisAmt = df["bsisAmt"].values

    def measure(pred_arr):
        estimated = bsisAmt * (pred_arr / 100)
        opt = (estimated - aValue) * lwlt + aValue
        actual_est = bsisAmt * (y / 100)
        real_lower = (actual_est - aValue) * lwlt + aValue
        disq = (opt < real_lower).mean() * 100
        dev = np.abs(pred_arr - y)
        top1_005 = (dev <= 0.05).mean() * 100
        win_05 = (dev <= 0.5).mean() * 100
        win_10 = (dev <= 1.0).mean() * 100
        return disq, top1_005, win_05, win_10

    print(f"\n{'='*100}")
    print(f"📊 B-q70 단독 vs B-q70 + 음수미러 sigma 0.03 (n={len(df):,})")
    print(f"{'='*100}")
    print(f"\n{'변형':35} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12}")
    print("-" * 100)

    for label, arr in [("B-q70 단독 (noise X)", bq70), ("B-q70 + 음수미러 sigma 0.03", bq70_n03)]:
        d, t1, w05, w10 = measure(arr)
        score = t1 - d * 0.05
        print(f"  {label[:33]:35} {d:>9.2f}% {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}%  점수 {score:>6.3f}")

    print(f"\nB-q70 평균: {bq70.mean():.3f}%")
    print(f"B-q70 + 음수미러 평균: {bq70_n03.mean():.3f}%")
    print(f"음수미러 평균: +{noise_003.mean():.4f}%p")

    print(f"\n[{time.strftime('%H:%M:%S')}] 완료", flush=True)


if __name__ == "__main__":
    main()
