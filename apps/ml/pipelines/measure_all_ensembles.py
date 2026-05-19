"""박상빈님 5/19 — 가능한 모든 앙상블 측정.

우선 대상 7개:
  1. #3 카테고리별 가중 (자동 선택)
  2. #2 Optuna 6way 가중
  3. B-q70-M1 (현재 운영)
  4. #9 카테고리별 독립 ML
  5. B-q70 단독
  6. B-q70 + B-q80 (부적격 강)
  7. C-grid-argmax (1위 ↑)

조합:
  - 2way (21개) / 3way (35) / 4way (35) / 5way (21) / 6way (7) / 7way (1) = 120
  - 각 단순 평균 + Optuna 자동 가중 (별도 측정)

145K backtest 전체.
"""
import sys, io, time, json, re
from itertools import combinations
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

    # 9 모델 + C grid 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 9 모델 + C grid 추론…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q50",   "sajung_quantile_q50_new.pkl"),
        ("B_q60",   "sajung_quantile_q60_new.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
        ("B_q80",   "sajung_quantile_q80_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)

    # C classifier
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

    # M1, B-q70-M1
    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    preds["B_q70_q80"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q80"]

    # #3 카테고리별 가중 (자동 선택) — 박상빈님 5/19 측정 결과 그대로
    cat_best_variants = {
        "시설공사":         preds["B_q70_M1"],
        "전기공사":         0.5 * preds["B_q70"] + 0.5 * preds["B_q60"],
        "토목공사":         preds["B_q70_M1"],
        "건축공사":         preds["B_q70_q80"],
        "실내건축공사":     preds["B_q70"],
        "기계설비공사":     preds["B_q70_M1"],
        "지반조성포장공사": 0.5 * preds["B_q70"] + 0.5 * preds["B_q60"],
        "상하수도설비공사": preds["B_q70_M1"],
        "도장습식방수석공사": preds["B_q70_q80"],
        "통신공사":         preds["B_q70_M1"],
        "조경식재공사":     (preds["B_q60"] + preds["B_q70"] + preds["B_q80"]) / 3,
        "소방시설공사":     preds["B_q70_M1"],
        "조경공사":         preds["B_q70_M1"],
        "철근콘크리트공사": preds["B_q70_q80"],
        "구조물해체비계공사": preds["B_q70_q80"],
    }
    cat3_pred = np.copy(preds["B_q70_M1"])
    for cat, arr in cat_best_variants.items():
        idx = np.where(df["category"].values == cat)[0]
        cat3_pred[idx] = arr[idx]
    preds["cat3"] = cat3_pred

    # #9 카테고리별 독립 ML
    cat9_pred = np.copy(preds["B_q70_M1"])
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) == 0: continue
        model_path = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        if not model_path.exists(): continue
        sub_df = df.iloc[idx]
        cat9_pred[idx] = predict_one(model_path, sub_df)
    preds["cat9"] = cat9_pred
    print(f"  cat9 적용 완료")

    # #2 Optuna 가중 (이전 best)
    optuna_w = {"B_q70": 0.14, "M1": 0.18, "B_q50": 0.19, "B_q60": 0.10, "B_q80": 0.20, "q95_old": 0.19}
    opt_pred = sum(preds[k] * w for k, w in optuna_w.items())
    preds["optuna"] = opt_pred

    # 우선 대상 7개
    candidates = {
        "cat3":     preds["cat3"],       # #3 카테고리별 가중 (3.456)
        "optuna":   preds["optuna"],     # #2 Optuna 가중 (3.388)
        "B_q70_M1": preds["B_q70_M1"],   # 현재 운영 (3.327)
        "cat9":     preds["cat9"],       # #9 카테고리별 독립 (3.322)
        "B_q70":    preds["B_q70"],      # B-q70 단독 (3.281)
        "B_q70_q80": preds["B_q70_q80"], # 부적격 ↓ 강 (3.220)
        "C_argmax": preds["C_argmax"],   # 1위 ↑ (2.895)
    }
    keys = list(candidates.keys())

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
        top1 = (dev <= 0.05).mean() * 100
        win_05 = (dev <= 0.5).mean() * 100
        win_10 = (dev <= 1.0).mean() * 100
        return disq, top1, win_05, win_10

    print(f"\n[{time.strftime('%H:%M:%S')}] 모든 단일 + 2~7way 평균 ensemble 측정…", flush=True)

    results = []
    # 단일
    for k in keys:
        d, t1, w05, w10 = measure(candidates[k])
        score = t1 - d * 0.05
        results.append({
            "label": f"단일: {k}",
            "n_models": 1,
            "components": [k],
            "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score,
        })

    # 2~7way 단순 평균
    for r in range(2, 8):
        for combo in combinations(keys, r):
            avg = np.mean(np.stack([candidates[k] for k in combo]), axis=0)
            d, t1, w05, w10 = measure(avg)
            score = t1 - d * 0.05
            results.append({
                "label": f"{r}way: {'+'.join(combo)}",
                "n_models": r,
                "components": list(combo),
                "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score,
            })

    # 정렬
    scored = sorted(results, key=lambda x: -x["score"])

    # Top 30 출력
    print(f"\n{'='*110}")
    print(f"🏆 ALL ensembles Top 30 (총 {len(results):,}개 조합)")
    print(f"{'='*110}")
    print(f"\n{'순위':>4} {'조합':80} {'부적격':>8} {'1위':>7} {'점수':>7}")
    print("-" * 110)
    for i, r in enumerate(scored[:30]):
        print(f"  {i+1:>2}  {r['label'][:78]:80} {r['disq']:>7.2f}% {r['top1']:>6.2f}% {r['score']:>6.3f}")

    # n_models 별 best
    print(f"\n{'='*110}")
    print(f"🥇 n_models 별 best")
    print(f"{'='*110}")
    print(f"\n{'n':>3} {'조합':80} {'부적격':>8} {'1위':>7} {'점수':>7}")
    print("-" * 110)
    by_n = {}
    for r in scored:
        n = r["n_models"]
        if n not in by_n:
            by_n[n] = r
    for n in sorted(by_n.keys()):
        r = by_n[n]
        print(f"  {n:>3}  {r['label'][:78]:80} {r['disq']:>7.2f}% {r['top1']:>6.2f}% {r['score']:>6.3f}")

    out_path = DATA_DIR / f"all_ensembles_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results_top30": scored[:30], "by_n_best": list(by_n.values())},
                  f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
