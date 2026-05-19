"""박상빈님 5/19 #3 — 카테고리별 다른 가중 측정.

각 카테고리(20개)에서 10가지 변형 점수 측정 → 카테고리별 best 변형 자동 선택.
신뢰도 기준: 카테고리 건수 >= 500 (대카테고리) 만 카테고리별 best 사용,
              작은 카테고리는 전체 best (B-q70-M1) 폴백.

145K 전체 vs 카테고리별 best 비교.
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

    # 모델 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 9 모델 추론…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("cat",     "sajung_catboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q60",   "sajung_quantile_q60_new.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
        ("B_q80",   "sajung_quantile_q80_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  {name}: 평균 {preds[name].mean():.3f}%")

    # C classifier grid argmax
    print(f"\n[{time.strftime('%H:%M:%S')}] C classifier…", flush=True)
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
    preds["C_argmax"] = candidate_grid[probs_per_cand.argmax(axis=1)]

    # M1 합성
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)

    # 변형 정의
    variants = {
        "B-q70-M1 (현재 운영)":         0.5 * preds["B_q70"] + 0.5 * preds["M1"],
        "B-q70 단독":                  preds["B_q70"],
        "B-q60 단독":                  preds["B_q60"],
        "B-q80 단독":                  preds["B_q80"],
        "B-q70 + B-q60 (50:50)":       0.5 * preds["B_q70"] + 0.5 * preds["B_q60"],
        "B-q70 + B-q80 (50:50)":       0.5 * preds["B_q70"] + 0.5 * preds["B_q80"],
        "B-q70+q60+q80 (1/3 each)":    (preds["B_q60"] + preds["B_q70"] + preds["B_q80"]) / 3,
        "M1 단독":                     preds["M1"],
        "C-grid 단독":                 preds["C_argmax"],
        "B-q70 + C-grid (50:50)":      0.5 * preds["B_q70"] + 0.5 * preds["C_argmax"],
    }

    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100
    aValue = df["aValueTotal"].values
    bsisAmt = df["bsisAmt"].values

    def measure_indices(pred_arr, idx):
        if len(idx) == 0:
            return 0, 0, 0, 0
        p = pred_arr[idx]
        yi = y[idx]
        lwi = lwlt[idx]
        avi = aValue[idx]
        bsi = bsisAmt[idx]
        estimated = bsi * (p / 100)
        opt = (estimated - avi) * lwi + avi
        actual_est = bsi * (yi / 100)
        real_lower = (actual_est - avi) * lwi + avi
        disq = (opt < real_lower).mean() * 100
        dev = np.abs(p - yi)
        top1_005 = (dev <= 0.05).mean() * 100
        win_05 = (dev <= 0.5).mean() * 100
        win_10 = (dev <= 1.0).mean() * 100
        return disq, top1_005, win_05, win_10

    # 카테고리별 best 선택
    print(f"\n{'='*110}")
    print(f"📊 카테고리별 변형 점수 (큰 카테고리 N>=500 만 표시)")
    print(f"{'='*110}")

    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    print(f"\n대카테고리 (N>=500): {len(big_cats)}개")

    cat_best = {}  # category → best variant name

    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        cat_results = {}
        for vname, varr in variants.items():
            d, t1, w05, w10 = measure_indices(varr, idx)
            score = t1 - d * 0.05
            cat_results[vname] = {"disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score}
        best = max(cat_results.items(), key=lambda kv: kv[1]["score"])
        cat_best[cat] = best[0]
        print(f"\n  [{cat[:30]:30}] N={len(idx):,}")
        print(f"    Best: {best[0][:38]:40} 점수 {best[1]['score']:.3f} (부적격 {best[1]['disq']:.2f}% / 1위 {best[1]['top1']:.2f}%)")
        # B-q70-M1 (현재 운영) 비교
        cur = cat_results["B-q70-M1 (현재 운영)"]
        print(f"    현재: B-q70-M1                                점수 {cur['score']:.3f} (부적격 {cur['disq']:.2f}% / 1위 {cur['top1']:.2f}%)")

    # 카테고리별 best 적용 최종 추천 계산
    final_pred = np.copy(variants["B-q70-M1 (현재 운영)"])  # 작은 카테고리는 B-q70-M1
    for cat, best_vname in cat_best.items():
        idx = np.where(df["category"].values == cat)[0]
        final_pred[idx] = variants[best_vname][idx]

    # 전체 측정
    print(f"\n{'='*110}")
    print(f"📊 145K 전체 측정 (카테고리별 best vs 단일 가중)")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    methods = [
        ("B-q70-M1 (현재 운영, 단일 가중)",     variants["B-q70-M1 (현재 운영)"]),
        ("카테고리별 best (자동 선택)",          final_pred),
    ]
    # 참고: 단일 변형도 145K 전체에서 측정
    for vname, varr in variants.items():
        if vname == "B-q70-M1 (현재 운영)":
            continue
        methods.append((f"(참고) {vname}", varr))

    results = []
    for label, arr in methods:
        d, t1, w05, w10 = measure_indices(arr, np.arange(len(df)))
        score = t1 - d * 0.05
        print(f"  {label[:48]:50} {d:>9.2f}% {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}% {score:>9.3f}")
        results.append({"label": label, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score})

    print(f"\n{'='*110}")
    print(f"🏆 점수 순위")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    print(f"\n카테고리별 best 매핑:")
    for cat, best in cat_best.items():
        print(f"  {cat[:30]:30} → {best}")

    out_path = DATA_DIR / f"category_weights_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored, "cat_best": cat_best},
                  f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
