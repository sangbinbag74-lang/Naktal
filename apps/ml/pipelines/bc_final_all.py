"""박상빈님 5/19 — 최종 통합 측정 (이름 통일 + 4 지표).

이름 통일:
  - 사정율 ML 기존 (5way 합성 재료):
    * ML-LGBM-v2     (LightGBM v2, 2025-04-24 학습, sajung_lgbm_v2.pkl)
    * ML-LGBM-tuned  (LightGBM v3 tuned, sajung_lgbm_v3_tuned.pkl)
    * ML-XGB         (XGBoost, sajung_xgboost.pkl)
    * ML-CAT         (CatBoost, sajung_catboost.pkl)
    * ML-Quantile-q95 (기존 Quantile q95, 운영, sajung_quantile_q95.pkl)
  - 박스권 B Quantile 신규 (5/19 학습, 11 quantile):
    * B-q05, B-q10, B-q20, B-q30, B-q40, B-q50, B-q60, B-q70, B-q80, B-q90, B-q95
  - 합성:
    * M1 = 5way 가중 평균 (ML 5개)
    * M1-N03 = M1 + 음수미러 sigma 0.03 (운영 적용 중)
  - 박스권 변형:
    * B-박스권중심 = (B-q40 + B-q60) / 2
    * M1-N03 박스권 clamp q40~q60
    * M1-N03 박스권 clamp q05~q95
    * B-q50 + M1-N03 ensemble (3가지 비율)
    * B-q40/q50/박스권중심 + 음수미러
  - C 분류:
    * C-grid-argmax (LightGBM Binary Classifier, sajung_classifier_grid.pkl)

측정 4 지표 (박상빈님 5/19 명시):
  1. 부적격율 (추천가 → 실제 낙찰하한가 비교)
  2. 1위 ±0.05%p (정밀 1위 적중)
  3. 진입오차 ±0.5%p (적당 박스)
  4. 진입오차 ±1.0%p (넓은 박스)
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
    if not model_path.exists():
        return None
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
    # 사정율 ML 기존 (5way 재료)
    base_models = [
        ("ML-LGBM-v2",      "sajung_lgbm_v2.pkl"),
        ("ML-LGBM-tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("ML-XGB",          "sajung_xgboost.pkl"),
        ("ML-CAT",          "sajung_catboost.pkl"),
        ("ML-Quantile-q95", "sajung_quantile_q95.pkl"),
    ]
    print(f"\n[{time.strftime('%H:%M:%S')}] 사정율 ML 기존 5개 추론…", flush=True)
    for name, fn in base_models:
        t0 = time.time()
        pred = predict_one(MODEL_DIR / fn, df)
        if pred is not None:
            preds[name] = pred
            print(f"  [{time.strftime('%H:%M:%S')}] {name}: 평균 {pred.mean():.3f}% ({time.time()-t0:.1f}s)", flush=True)

    # 박스권 B Quantile 신규 11개
    print(f"\n[{time.strftime('%H:%M:%S')}] 박스권 B Quantile 신규 11개 추론…", flush=True)
    for q in ["q05", "q10", "q20", "q30", "q40", "q50", "q60", "q70", "q80", "q90", "q95"]:
        t0 = time.time()
        pred = predict_one(MODEL_DIR / f"sajung_quantile_{q}_new.pkl", df)
        if pred is not None:
            preds[f"B-{q}"] = pred
            print(f"  [{time.strftime('%H:%M:%S')}] B-{q}: 평균 {pred.mean():.3f}% ({time.time()-t0:.1f}s)", flush=True)

    # C 분류 grid argmax
    print(f"\n[{time.strftime('%H:%M:%S')}] C 분류 grid argmax 추론…", flush=True)
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
        if (i + 1) % 10 == 0:
            print(f"  [{time.strftime('%H:%M:%S')}] C grid {i+1}/{len(candidate_grid)}", flush=True)
    preds["C-grid-argmax"] = candidate_grid[probs_per_cand.argmax(axis=1)]
    print(f"  C-grid-argmax: 평균 {preds['C-grid-argmax'].mean():.3f}%", flush=True)

    # M1 합성
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["ML-LGBM-v2"], preds["ML-LGBM-tuned"], preds["ML-XGB"], preds["ML-CAT"], preds["ML-Quantile-q95"]])
    preds["M1"] = (P5.T @ m1_w)
    rng = np.random.default_rng(42)
    noise_003 = np.abs(rng.normal(0, 0.03, len(df)))
    preds["M1-N03 (운영중)"] = preds["M1"] + noise_003

    # 박스권 변형
    preds["M1-N03 박스권 q40~q60 clamp"] = np.clip(preds["M1-N03 (운영중)"], preds["B-q40"], preds["B-q60"])
    preds["M1-N03 박스권 q05~q95 clamp"] = np.clip(preds["M1-N03 (운영중)"], preds["B-q05"], preds["B-q95"])
    preds["B-q40 + 음수미러"] = preds["B-q40"] + noise_003
    preds["B-q50 + 음수미러"] = preds["B-q50"] + noise_003
    preds["B-박스권중심 (q40+q60)/2"] = (preds["B-q40"] + preds["B-q60"]) / 2
    preds["B-박스권중심 + 음수미러"] = preds["B-박스권중심 (q40+q60)/2"] + noise_003
    preds["B-q50:0.5 + M1-N03:0.5"] = 0.5 * preds["B-q50"] + 0.5 * preds["M1-N03 (운영중)"]
    preds["B-q50:0.7 + M1-N03:0.3"] = 0.7 * preds["B-q50"] + 0.3 * preds["M1-N03 (운영중)"]
    preds["B-q50:0.3 + M1-N03:0.7"] = 0.3 * preds["B-q50"] + 0.7 * preds["M1-N03 (운영중)"]

    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100
    aValue = df["aValueTotal"].values
    bsisAmt = df["bsisAmt"].values

    def measure(pred_arr):
        # 부적격율: 추천가 → 추정 낙찰하한가 vs 실제 낙찰하한가
        estimated = bsisAmt * (pred_arr / 100)
        opt = (estimated - aValue) * lwlt + aValue
        actual_est = bsisAmt * (y / 100)
        real_lower = (actual_est - aValue) * lwlt + aValue
        disq = (opt < real_lower).mean() * 100
        # 진입오차 박스 (사정율 편차)
        dev = np.abs(pred_arr - y)
        top1_005 = (dev <= 0.05).mean() * 100
        win_05 = (dev <= 0.5).mean() * 100
        win_10 = (dev <= 1.0).mean() * 100
        return disq, top1_005, win_05, win_10

    print(f"\n{'='*110}")
    print(f"📊 145K 통합 측정 (이름 통일 + 4 지표)")
    print(f"{'='*110}")
    print(f"\n{'모델':45} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12}")
    print("-" * 110)

    methods = [
        ("M1-N03 (운영중) — 5way+음수미러",         "M1-N03 (운영중)"),
        ("",                                          None),
        ("=== 사정율 ML 기존 5개 단독 ===",          None),
        ("ML-LGBM-v2 단독",                          "ML-LGBM-v2"),
        ("ML-LGBM-tuned 단독",                       "ML-LGBM-tuned"),
        ("ML-XGB 단독",                              "ML-XGB"),
        ("ML-CAT 단독",                              "ML-CAT"),
        ("ML-Quantile-q95 단독 (기존 운영)",         "ML-Quantile-q95"),
        ("",                                          None),
        ("=== 박스권 B Quantile 신규 11개 단독 ===", None),
        ("B-q05 단독",                               "B-q05"),
        ("B-q10 단독",                               "B-q10"),
        ("B-q20 단독",                               "B-q20"),
        ("B-q30 단독",                               "B-q30"),
        ("B-q40 단독",                               "B-q40"),
        ("B-q50 단독 (중앙값)",                      "B-q50"),
        ("B-q60 단독",                               "B-q60"),
        ("B-q70 단독",                               "B-q70"),
        ("B-q80 단독",                               "B-q80"),
        ("B-q90 단독",                               "B-q90"),
        ("B-q95 단독",                               "B-q95"),
        ("B-박스권중심 (q40+q60)/2",                 "B-박스권중심 (q40+q60)/2"),
        ("",                                          None),
        ("=== B + 음수미러 sigma 0.03 ===",           None),
        ("B-q40 + 음수미러",                         "B-q40 + 음수미러"),
        ("B-q50 + 음수미러",                         "B-q50 + 음수미러"),
        ("B-박스권중심 + 음수미러",                  "B-박스권중심 + 음수미러"),
        ("",                                          None),
        ("=== M1-N03 + B 박스권 clamp ===",          None),
        ("M1-N03 박스권 q40~q60 clamp",              "M1-N03 박스권 q40~q60 clamp"),
        ("M1-N03 박스권 q05~q95 clamp",              "M1-N03 박스권 q05~q95 clamp"),
        ("",                                          None),
        ("=== B + M1-N03 ensemble ===",              None),
        ("B-q50:0.3 + M1-N03:0.7",                   "B-q50:0.3 + M1-N03:0.7"),
        ("B-q50:0.5 + M1-N03:0.5",                   "B-q50:0.5 + M1-N03:0.5"),
        ("B-q50:0.7 + M1-N03:0.3",                   "B-q50:0.7 + M1-N03:0.3"),
        ("",                                          None),
        ("=== C 분류 grid argmax ===",                None),
        ("C-grid-argmax (단독)",                     "C-grid-argmax"),
    ]

    results = []
    for label, key in methods:
        if key is None:
            if label: print(label)
            continue
        if key not in preds: continue
        d, t1, w05, w10 = measure(preds[key])
        print(f"  {label[:43]:45} {d:>9.2f}% {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}%")
        results.append({
            "label": label, "disq": d,
            "top1_005": t1, "win_05": w05, "win_10": w10,
        })

    print(f"\n{'='*110}")
    print(f"📊 박스권 부적격 측정 (실제 y 박스권 분포 + M1-N03 박스권 안전성)")
    print(f"{'='*110}")
    y_below_q05 = (y < preds["B-q05"]).mean() * 100
    y_above_q95 = (y > preds["B-q95"]).mean() * 100
    m1n_below_q05 = (preds["M1-N03 (운영중)"] < preds["B-q05"]).mean() * 100
    m1n_above_q95 = (preds["M1-N03 (운영중)"] > preds["B-q95"]).mean() * 100
    m1n_in_full = ((preds["M1-N03 (운영중)"] >= preds["B-q05"]) & (preds["M1-N03 (운영중)"] <= preds["B-q95"])).mean() * 100
    m1n_in_mid  = ((preds["M1-N03 (운영중)"] >= preds["B-q40"]) & (preds["M1-N03 (운영중)"] <= preds["B-q60"])).mean() * 100
    print(f"  실제 y < B-q05 (실제 부적격 박스권 위반): {y_below_q05:.2f}%")
    print(f"  실제 y > B-q95 (상한 위반):                {y_above_q95:.2f}%")
    print(f"  M1-N03 < B-q05 (부적격 위험):              {m1n_below_q05:.2f}%")
    print(f"  M1-N03 > B-q95 (상한 초과):                {m1n_above_q95:.2f}%")
    print(f"  M1-N03 ∈ B-q05~q95 박스권 안:              {m1n_in_full:.2f}%")
    print(f"  M1-N03 ∈ B-q40~q60 박스권 중심 안:         {m1n_in_mid:.2f}%")

    # 점수 정렬 (top1 - disq*0.05)
    print(f"\n{'='*110}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1±0.05 - disq*0.05)")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -(r["top1_005"] - r["disq"] * 0.05))
    for i, r in enumerate(scored):
        score = r["top1_005"] - r["disq"] * 0.05
        print(f"  {i+1:>2}  {r['label'][:43]:45} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1_005']:>5.2f}% / 점수 {score:>6.3f}")

    out_path = DATA_DIR / f"bc_final_all_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
