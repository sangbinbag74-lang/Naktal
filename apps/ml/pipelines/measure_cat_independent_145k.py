"""박상빈님 5/19 #9 — 카테고리별 독립 ML 145K backtest 측정.

각 row 의 카테고리에 따라 해당 카테고리 모델 사용.
B-q70-M1 (현재 운영) + #3 (카테고리별 가중) 와 비교.
"""
import sys, io, time, json, re
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


def slug(s):
    return re.sub(r"[^A-Za-z0-9가-힣]+", "_", str(s))[:30]


def predict_with_payload(payload, df_in):
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

    # bc_final_all 와 동일 feature set (DB 조회 컬럼만, 누락 feature = 0)
    # = 다른 측정 (bc_final_all #3) 와 직접 비교 가능
    print(f"[{time.strftime('%H:%M:%S')}] 표본 {len(df):,}건 (bc_final_all 동일 feature set)", flush=True)

    # B-q70-M1 (비교용) — cat weight 0 이므로 제외 (CatBoost 추론 별도 처리 필요, 영향 X)
    print(f"\n[{time.strftime('%H:%M:%S')}] B-q70-M1 합성용 5 모델 추론 (cat 제외, weight 0)…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        p = joblib.load(MODEL_DIR / fn)
        preds[name] = predict_with_payload(p, df)
    # M1 가중 (cat 제외): v2 0.15 + tuned 0.15 + xgb 0.10 + q95 0.60 (sum=1.0)
    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    print(f"  B-q70-M1: 평균 {preds['B_q70_M1'].mean():.3f}%")

    # 카테고리별 독립 모델 적용
    print(f"\n[{time.strftime('%H:%M:%S')}] 카테고리별 독립 모델 적용…", flush=True)
    cat_indep_pred = np.copy(preds["B_q70_M1"])  # default 폴백 = B-q70-M1
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()

    coverage = 0
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) == 0: continue
        model_path = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        if not model_path.exists():
            print(f"  [{cat}] 모델 없음 - 폴백")
            continue
        payload = joblib.load(model_path)
        sub_df = df.iloc[idx]
        pred = predict_with_payload(payload, sub_df)
        cat_indep_pred[idx] = pred
        coverage += len(idx)
        print(f"  [{cat[:25]:25}] N={len(idx):,} 적용 완료")

    print(f"\n  Coverage: {coverage:,}/{len(df):,} ({coverage/len(df)*100:.1f}%)")
    preds["cat_indep"] = cat_indep_pred

    # ensemble: 카테고리별 독립 + B-q70-M1 50:50
    preds["cat_indep_M1_5050"] = 0.5 * cat_indep_pred + 0.5 * preds["B_q70_M1"]

    # 측정
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
    print(f"📊 145K backtest — 카테고리별 독립 ML vs 비교")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    methods = [
        ("B-q70-M1 (현재 운영)",                  "B_q70_M1"),
        ("B-q70 단독",                            "B_q70"),
        ("#9 카테고리별 독립 ML 단독",             "cat_indep"),
        ("#9 카테고리별 독립 + B-q70-M1 (50:50)", "cat_indep_M1_5050"),
    ]

    results = []
    for label, key in methods:
        d, t1, w05, w10 = measure(preds[key])
        score = t1 - d * 0.05
        print(f"  {label[:48]:50} {d:>9.2f}% {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}% {score:>9.3f}")
        results.append({"label": label, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score})

    print(f"\n{'='*110}")
    print(f"🏆 점수 순위")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"cat_indep_145k_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
