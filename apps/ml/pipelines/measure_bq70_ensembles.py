"""박상빈님 5/19 — B-q70 + 다른 모델 ensemble 측정 (1~5번).

비교:
  1. B-q70 + B-q80 (50:50)
  2. B-q70 + B-q60 (50:50)
  3. B-q70 + M1-N03 (0.5/0.5)
  4. B-q70 + ML-Quantile-q95 (50:50)
  5. B-q70 + C-grid-argmax (0.5/0.5)

기준: B-q70 단독 + 음수미러 (운영중) = 부적격 30.33% / 1위 4.80% / 점수 3.287.
4 지표: 부적격율 / 1위±0.05%p / 진입±0.5%p / 진입±1.0%p.
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

    preds = {}
    needed = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("cat",     "sajung_catboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q60",   "sajung_quantile_q60_new.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
        ("B_q80",   "sajung_quantile_q80_new.pkl"),
    ]
    print(f"\n[{time.strftime('%H:%M:%S')}] 8 모델 추론…", flush=True)
    for name, fn in needed:
        t0 = time.time()
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  [{time.strftime('%H:%M:%S')}] {name}: 평균 {preds[name].mean():.3f}% ({time.time()-t0:.1f}s)", flush=True)

    # C classifier grid argmax
    print(f"\n[{time.strftime('%H:%M:%S')}] C classifier grid argmax…", flush=True)
    c_payload = joblib.load(MODEL_DIR / "sajung_classifier_grid.pkl")
    c_model = c_payload["model"]
    c_features = c_payload["feature_names"]
    c_cats = c_payload["categorical_cols"]
    c_encs = c_payload["encoders"]
    base_features = [f for f in c_features if f != "candidate_sajung"]
    X_base = pd.DataFrame()
    for f in base_features:
        X_base[f] = df[f] if f in df.columns else 0
    for col in c_cats:
        if col in c_encs:
            le = c_encs[col]
            mapping = {v: i for i, v in enumerate(le.classes_)}
            X_base[col] = X_base[col].fillna("").astype(str).map(mapping).fillna(0).astype(int)
        else:
            X_base[col] = 0
    X_base_np = X_base.values
    candidate_grid = np.arange(97.0, 103.01, 0.1)
    probs_per_cand = np.zeros((len(df), len(candidate_grid)))
    for i, c in enumerate(candidate_grid):
        X = np.hstack([X_base_np, np.full((len(df), 1), c)])
        probs_per_cand[:, i] = c_model.predict(X, num_iteration=c_model.best_iteration)
        if (i + 1) % 15 == 0:
            print(f"  [{time.strftime('%H:%M:%S')}] C grid {i+1}/{len(candidate_grid)}", flush=True)
    preds["C_argmax"] = candidate_grid[probs_per_cand.argmax(axis=1)]
    print(f"  C-grid-argmax: 평균 {preds['C_argmax'].mean():.3f}%", flush=True)

    # M1-N03 합성
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)
    rng = np.random.default_rng(42)
    noise_003 = np.abs(rng.normal(0, 0.03, len(df)))
    preds["M1_N03"] = preds["M1"] + noise_003

    # B-q70 + 음수미러 (기준)
    preds["B_q70_N03"] = preds["B_q70"] + noise_003

    # 5 ensemble
    preds["E1_q70_q80"]    = 0.5 * preds["B_q70"] + 0.5 * preds["B_q80"]
    preds["E2_q70_q60"]    = 0.5 * preds["B_q70"] + 0.5 * preds["B_q60"]
    preds["E3_q70_M1N03"]  = 0.5 * preds["B_q70"] + 0.5 * preds["M1_N03"]
    preds["E4_q70_q95old"] = 0.5 * preds["B_q70"] + 0.5 * preds["q95_old"]
    preds["E5_q70_C"]      = 0.5 * preds["B_q70"] + 0.5 * preds["C_argmax"]

    # + 음수미러 변형 (운영 적용 시 사용)
    preds["E1_q70_q80_N03"]   = preds["E1_q70_q80"] + noise_003
    preds["E2_q70_q60_N03"]   = preds["E2_q70_q60"] + noise_003
    preds["E3_q70_M1N03_N03"] = preds["E3_q70_M1N03"] + noise_003  # 이미 N03 1번
    preds["E4_q70_q95old_N03"] = preds["E4_q70_q95old"] + noise_003
    preds["E5_q70_C_N03"]     = preds["E5_q70_C"] + noise_003

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

    print(f"\n{'='*110}")
    print(f"📊 B-q70 + 다른 모델 ensemble 측정 (1~5번)")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    methods = [
        ("== 기준 ==", None),
        ("B-q70 + 음수미러 (현재 운영중)",                "B_q70_N03"),
        ("B-q70 단독 (noise X)",                          "B_q70"),
        ("", None),
        ("== 1. B-q70 + B-q80 (50:50) ==", None),
        ("B-q70 + B-q80 (noise X)",                      "E1_q70_q80"),
        ("B-q70 + B-q80 + 음수미러",                     "E1_q70_q80_N03"),
        ("", None),
        ("== 2. B-q70 + B-q60 (50:50) ==", None),
        ("B-q70 + B-q60 (noise X)",                      "E2_q70_q60"),
        ("B-q70 + B-q60 + 음수미러",                     "E2_q70_q60_N03"),
        ("", None),
        ("== 3. B-q70 + M1-N03 (0.5/0.5) ==", None),
        ("B-q70 + M1 (noise X)",                         "E3_q70_M1N03"),
        ("B-q70 + M1-N03 + 추가 음수미러",               "E3_q70_M1N03_N03"),
        ("", None),
        ("== 4. B-q70 + ML-Quantile-q95 (50:50) ==", None),
        ("B-q70 + q95old (noise X)",                     "E4_q70_q95old"),
        ("B-q70 + q95old + 음수미러",                    "E4_q70_q95old_N03"),
        ("", None),
        ("== 5. B-q70 + C-grid-argmax (50:50) ==", None),
        ("B-q70 + C-grid (noise X)",                     "E5_q70_C"),
        ("B-q70 + C-grid + 음수미러",                    "E5_q70_C_N03"),
    ]

    results = []
    for label, key in methods:
        if key is None:
            if label: print(label)
            continue
        if key not in preds: continue
        d, t1, w05, w10 = measure(preds[key])
        score = t1 - d * 0.05
        print(f"  {label[:48]:50} {d:>9.2f}% {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}% {score:>9.3f}")
        results.append({"label": label, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score})

    # 정렬 순위
    print(f"\n{'='*110}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1±0.05 - disq*0.05)")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"bq70_ensembles_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
