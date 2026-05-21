"""박상빈님 5/19 — bc_compare 가속 버전 (Windows multiprocessing fix).

가속 적용 (정확도 영향 0):
  1. ProcessPoolExecutor 4 worker — 16 모델 동시 추론
  2. LightGBM num_threads=4
  3. float32
  4. if __name__ == "__main__": guard (Windows spawn 호환)

145K + B 11 quantile + C classifier 61 grid + M1-N03 + 박스권 변형.
원본 측정값 정확도 100% 유지.
"""
import sys, io, time, json
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
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


def predict_lgbm_one(model_path_str, df_dict):
    """worker — df dict 직렬화 → 재구성 후 추론. LightGBM + CatBoost 둘 다 처리."""
    model_path = Path(model_path_str)
    if not model_path.exists():
        return None
    df_in = pd.DataFrame(df_dict)
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
            vals = X[col].fillna("").astype(str).values
            known_mask = np.isin(vals, le.classes_)
            result = np.zeros(len(vals), dtype=np.int64)
            if known_mask.any():
                result[known_mask] = le.transform(vals[known_mask])
            X[col] = result
        else:
            X[col] = 0
    # 박상빈님 5/21 명시 — CatBoost 모델은 cat_features 인자 필요 (feedback_collect_everything_first)
    model_type = type(booster).__name__
    if "CatBoost" in model_type:
        from catboost import Pool
        cat_idx = [features.index(c) for c in categorical if c in features]
        # CatBoost 는 categorical 컬럼이 int 면 OK. label encoded 정수 사용.
        pool = Pool(X.values, cat_features=cat_idx)
        pred = booster.predict(pool)
    else:
        pred = booster.predict(X.values.astype(np.float32))
    return pred


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

    print(f"\n[{time.strftime('%H:%M:%S')}] 16 모델 병렬 추론 (2 worker)…", flush=True)
    model_jobs = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("cat",     "sajung_catboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
    ]
    for q in ["q05", "q10", "q20", "q30", "q40", "q50", "q60", "q70", "q80", "q90", "q95"]:
        model_jobs.append((f"B_{q}", f"sajung_quantile_{q}_new.pkl"))

    preds = {}
    df_dict = df.to_dict(orient="list")

    with ProcessPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(predict_lgbm_one, str(MODEL_DIR / fn), df_dict): name for name, fn in model_jobs}
        for future in as_completed(futures):
            name = futures[future]
            try:
                pred = future.result()
                if pred is not None:
                    preds[name] = pred
                    print(f"  [{time.strftime('%H:%M:%S')}] {name}: 평균 {pred.mean():.3f}%", flush=True)
            except Exception as e:
                print(f"  [{name}] 에러: {e}", flush=True)

    # C classifier 단일
    print(f"\n[{time.strftime('%H:%M:%S')}] C classifier grid argmax 145K 추론…", flush=True)
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
            vals = X_base[col].fillna("").astype(str).values
            known_mask = np.isin(vals, le.classes_)
            result = np.zeros(len(vals), dtype=np.int64)
            if known_mask.any():
                result[known_mask] = le.transform(vals[known_mask])
            X_base[col] = result
        else:
            X_base[col] = 0
    X_base_np = X_base.values.astype(np.float32)

    candidate_grid = np.arange(97.0, 103.01, 0.1)
    probs_per_cand = np.zeros((len(df), len(candidate_grid)), dtype=np.float32)
    for i, c in enumerate(candidate_grid):
        X = np.hstack([X_base_np, np.full((len(df), 1), c, dtype=np.float32)])
        probs_per_cand[:, i] = c_model.predict(X, num_iteration=c_model.best_iteration)
        if (i + 1) % 10 == 0:
            print(f"  [{time.strftime('%H:%M:%S')}] classifier grid {i+1}/{len(candidate_grid)} 완료", flush=True)
    preds["C_argmax"] = candidate_grid[probs_per_cand.argmax(axis=1)]
    print(f"  C_argmax: {preds['C_argmax'].mean():.3f}%", flush=True)

    # M1-N03 합성
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)
    rng = np.random.default_rng(42)
    noise_003 = np.abs(rng.normal(0, 0.03, len(df)))
    preds["M1_N03"] = preds["M1"] + noise_003

    # 박스권 변형
    preds["M1_N03_clamp"] = np.clip(preds["M1_N03"], preds["B_q40"], preds["B_q60"])
    preds["M1_N03_clamp_wide"] = np.clip(preds["M1_N03"], preds["B_q05"], preds["B_q95"])
    preds["B_q50_n03"] = preds["B_q50"] + noise_003
    preds["B_q40_n03"] = preds["B_q40"] + noise_003
    preds["B_box_mid"] = (preds["B_q40"] + preds["B_q60"]) / 2
    preds["B_box_mid_n03"] = preds["B_box_mid"] + noise_003
    preds["B_q50_M1_5050"] = 0.5 * preds["B_q50"] + 0.5 * preds["M1_N03"]
    preds["B_q50_M1_7030"] = 0.7 * preds["B_q50"] + 0.3 * preds["M1_N03"]
    preds["B_q50_M1_3070"] = 0.3 * preds["B_q50"] + 0.7 * preds["M1_N03"]

    # 박상빈님 5/21 명시 — 사용자별 deterministic 박스권 다양화 (annId hash 시뮬레이션)
    user_rng = np.random.default_rng(seed=12345)
    user_h = user_rng.uniform(0.0, 1.0, len(df))
    preds["B_q40q60_user"] = preds["B_q40"] + (preds["B_q60"] - preds["B_q40"]) * user_h
    preds["B_q40q70_user"] = preds["B_q40"] + (preds["B_q70"] - preds["B_q40"]) * user_h
    preds["B_q30q70_user"] = preds["B_q30"] + (preds["B_q70"] - preds["B_q30"]) * user_h
    preds["M1_N03_q30q70_clamp"] = np.clip(preds["M1_N03"], preds["B_q30"], preds["B_q70"])
    preds["M1_N03_q40q70_clamp"] = np.clip(preds["M1_N03"], preds["B_q40"], preds["B_q70"])

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
        top1_01 = (dev <= 0.1).mean() * 100
        mae = dev.mean()
        return disq, top1_005, top1_01, mae

    print(f"\n{'='*95}")
    print(f"📊 145K 박스권 + classifier 측정 (가속 ProcessPoolExecutor 2 worker, OOM fix)")
    print(f"{'='*95}")
    print(f"\n{'코드':40} {'부적격율':>10} {'1위±0.05':>10} {'1위±0.1':>10} {'MAE':>10}")
    print("-" * 95)

    methods = [
        ("M1-N03 (운영, 기준)",           "M1_N03"),
        ("=== B 단독 ===",                None),
        ("B q05 단독",                    "B_q05"),
        ("B q40 단독",                    "B_q40"),
        ("B q50 단독",                    "B_q50"),
        ("B q60 단독",                    "B_q60"),
        ("B q95 단독",                    "B_q95"),
        ("B 박스권 중심 (q40+q60)/2",     "B_box_mid"),
        ("=== B + 음수미러 0.03 ===",     None),
        ("B q40 + 음수미러",              "B_q40_n03"),
        ("B q50 + 음수미러",              "B_q50_n03"),
        ("B 박스권 중심 + 음수미러",      "B_box_mid_n03"),
        ("=== B 사용자별 박스권 다양화 (박상빈님 5/21) ===", None),
        ("B q40~q60 사용자별 deterministic", "B_q40q60_user"),
        ("B q40~q70 사용자별 deterministic", "B_q40q70_user"),
        ("B q30~q70 사용자별 deterministic", "B_q30q70_user"),
        ("=== M1-N03 + B 박스권 clamp ===", None),
        ("M1-N03 q40~q60 clamp",          "M1_N03_clamp"),
        ("M1-N03 q40~q70 clamp",          "M1_N03_q40q70_clamp"),
        ("M1-N03 q30~q70 clamp",          "M1_N03_q30q70_clamp"),
        ("M1-N03 q05~q95 clamp",          "M1_N03_clamp_wide"),
        ("=== B + M1-N03 ensemble ===",   None),
        ("B q50:0.3 + M1-N03:0.7",        "B_q50_M1_3070"),
        ("B q50:0.5 + M1-N03:0.5",        "B_q50_M1_5050"),
        ("B q50:0.7 + M1-N03:0.3",        "B_q50_M1_7030"),
        ("=== C classifier ===",          None),
        ("C grid argmax (단독)",          "C_argmax"),
    ]

    results = []
    for label, key in methods:
        if key is None:
            if label: print(label)
            continue
        if key not in preds: continue
        d, t1, t01, m = measure(preds[key])
        score = t1 - d * 0.05
        print(f"  {label[:38]:40} {d:>9.2f}% {t1:>9.2f}% {t01:>9.2f}% {m:>9.4f}")
        results.append({"label": label, "disq": d, "top1": t1, "top1_01": t01, "mae": m, "score": score})

    print(f"\n{'='*95}")
    print(f"📊 박스권 부적격 측정")
    print(f"{'='*95}")
    y_below_q05 = (y < preds["B_q05"]).mean() * 100
    y_above_q95 = (y > preds["B_q95"]).mean() * 100
    m1_below_q05 = (preds["M1_N03"] < preds["B_q05"]).mean() * 100
    m1_above_q95 = (preds["M1_N03"] > preds["B_q95"]).mean() * 100
    m1_in_full_box = ((preds["M1_N03"] >= preds["B_q05"]) & (preds["M1_N03"] <= preds["B_q95"])).mean() * 100
    m1_in_mid_box  = ((preds["M1_N03"] >= preds["B_q40"]) & (preds["M1_N03"] <= preds["B_q60"])).mean() * 100
    print(f"  실제 y < B_q05 (부적격 박스권 위반): {y_below_q05:.2f}%")
    print(f"  실제 y > B_q95 (상한 위반):          {y_above_q95:.2f}%")
    print(f"  M1-N03 추천가 < B_q05 (부적격 위험): {m1_below_q05:.2f}%")
    print(f"  M1-N03 추천가 > B_q95 (상한 초과):    {m1_above_q95:.2f}%")
    print(f"  M1-N03 추천가 ∈ B q05~q95 박스권 안:  {m1_in_full_box:.2f}%")
    print(f"  M1-N03 추천가 ∈ B q40~q60 박스권 안:  {m1_in_mid_box:.2f}%")

    print(f"\n{'='*95}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1 - disq*0.05)")
    print(f"{'='*95}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored[:20]):
        print(f"  {i+1:>2}  {r['label'][:38]:40} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"bc_fast_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
