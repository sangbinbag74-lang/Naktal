"""박상빈님 5/19 — cat3 발전 종합 결합 측정 (가능한 많은 결합).

후보 카테고리별 변형:
  - cat3 (현재 운영)
  - optuna (#1 카테고리별 자동 가중)
  - cat9 (#9 카테고리별 독립 ML, 시간 가중 X)
  - cat7 (#7 카테고리별 시간 trend ML)
  - B-q70-M1 단순
  - B-q70+B-q60 / B-q70+B-q80 / B-q70 단독 / 3way

각 카테고리에서:
  - 단순 평균 (모든 후보)
  - best 자동 선택 (점수 기준)
  - top-K 결합

전체 측정 + 145K backtest.
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
import optuna

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
optuna.logging.set_verbosity(optuna.logging.WARNING)


def load_env():
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("DIRECT_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")


def slug(s):
    return re.sub(r"[^A-Za-z0-9가-힣]+", "_", str(s))[:30]


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

    # 기본 모델 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 기본 모델 추론…", flush=True)
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

    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    preds["B_q70_q60"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q60"]
    preds["B_q70_q80"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q80"]
    preds["B_q60_q70_q80"] = (preds["B_q60"] + preds["B_q70"] + preds["B_q80"]) / 3

    # cat3 (현재 운영)
    cat_best_v = {
        "시설공사": "B_q70_M1", "전기공사": "B_q70_q60", "토목공사": "B_q70_M1",
        "건축공사": "B_q70_q80", "실내건축공사": "B_q70", "기계설비공사": "B_q70_M1",
        "지반조성포장공사": "B_q70_q60", "상하수도설비공사": "B_q70_M1",
        "도장습식방수석공사": "B_q70_q80", "통신공사": "B_q70_M1",
        "조경식재공사": "B_q60_q70_q80", "소방시설공사": "B_q70_M1",
        "조경공사": "B_q70_M1", "철근콘크리트공사": "B_q70_q80",
        "구조물해체비계공사": "B_q70_q80",
    }
    cat3_pred = np.copy(preds["B_q70_M1"])
    for cat, vname in cat_best_v.items():
        idx = np.where(df["category"].values == cat)[0]
        cat3_pred[idx] = preds[vname][idx]

    # cat9 (시간 가중 X, 카테고리별 독립 ML)
    print(f"\n[{time.strftime('%H:%M:%S')}] cat9 + cat7 추론…", flush=True)
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    cat9_pred = np.copy(preds["B_q70_M1"])
    cat7_pred = np.copy(preds["B_q70_M1"])
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        m9 = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        m7 = MODEL_DIR / f"sajung_q70_cat_time_{slug(cat)}.pkl"
        if m9.exists():
            cat9_pred[idx] = predict_one(m9, df.iloc[idx])
        if m7.exists():
            cat7_pred[idx] = predict_one(m7, df.iloc[idx])

    # Optuna 카테고리별 자동 가중 (#1)
    print(f"\n[{time.strftime('%H:%M:%S')}] Optuna 카테고리별 가중 (#1)…", flush=True)
    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100
    aValue = df["aValueTotal"].values
    bsisAmt = df["bsisAmt"].values

    def measure_idx(pred_arr, idx):
        p = pred_arr[idx]; yi = y[idx]; lwi = lwlt[idx]
        avi = aValue[idx]; bsi = bsisAmt[idx]
        estimated = bsi * (p / 100)
        opt = (estimated - avi) * lwi + avi
        actual_est = bsi * (yi / 100)
        real_lower = (actual_est - avi) * lwi + avi
        disq = (opt < real_lower).mean() * 100
        dev = np.abs(p - yi)
        return disq, (dev <= 0.05).mean() * 100, (dev <= 0.5).mean() * 100, (dev <= 1.0).mean() * 100

    optuna_pred = np.copy(preds["B_q70_M1"])
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) < 500: continue
        comp = ["B_q70", "B_q60", "B_q80", "M1"]
        cmat = np.stack([preds[k][idx] for k in comp], axis=0)
        yi = y[idx]; lwi = lwlt[idx]; avi = aValue[idx]; bsi = bsisAmt[idx]
        def obj(trial):
            w = np.array([trial.suggest_float(c, 0, 1) for c in comp])
            if w.sum() < 0.1: return -10
            w /= w.sum()
            p = cmat.T @ w
            est = bsi * (p / 100); o = (est - avi) * lwi + avi
            ae = bsi * (yi / 100); rl = (ae - avi) * lwi + avi
            d = (o < rl).mean() * 100
            dev = np.abs(p - yi)
            return (dev <= 0.05).mean() * 100 - d * 0.05
        st = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
        st.optimize(obj, n_trials=200, show_progress_bar=False)
        best_w = np.array([st.best_params[c] for c in comp])
        best_w /= best_w.sum()
        optuna_pred[idx] = cmat.T @ best_w

    # 카테고리별 변형 매핑 (cat3 / optuna / cat9 / cat7 / 단순) 후보별 측정
    print(f"\n[{time.strftime('%H:%M:%S')}] 카테고리별 best 자동 선택 (cat3/optuna/cat9/cat7)…", flush=True)
    cat_candidates = {
        "cat3": cat3_pred,
        "optuna": optuna_pred,
        "cat9": cat9_pred,
        "cat7": cat7_pred,
    }
    # 각 카테고리에서 4가지 변형 점수 측정 → best 선택
    cat_best_choice = {}
    auto_best_pred = np.copy(preds["B_q70_M1"])
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) < 100: continue
        cat_scores = {}
        for k, arr in cat_candidates.items():
            d, t1, _, _ = measure_idx(arr, idx)
            cat_scores[k] = t1 - d * 0.05
        best_k = max(cat_scores.items(), key=lambda x: x[1])[0]
        cat_best_choice[cat] = (best_k, cat_scores)
        auto_best_pred[idx] = cat_candidates[best_k][idx]

    # 측정 함수
    def measure_all(pred_arr):
        d, t1, w05, w10 = measure_idx(pred_arr, np.arange(len(df)))
        return d, t1, w05, w10, t1 - d * 0.05

    print(f"\n{'='*110}")
    print(f"🏆 cat3 발전 종합 결합 측정")
    print(f"{'='*110}")
    print(f"\n{'변형':70} {'부적격':>8} {'1위':>7} {'점수':>7}")
    print("-" * 110)

    results = []
    methods = [
        ("cat3 (현재 운영, 5/19 채택)",                cat3_pred),
        ("optuna (#1 카테고리별 가중)",                 optuna_pred),
        ("cat9 (#9 시간 가중 X)",                       cat9_pred),
        ("cat7 (#7 시간 가중 ↑)",                       cat7_pred),
        ("auto_best 카테고리별 best (cat3/optuna/cat9/cat7)", auto_best_pred),
        ("cat3 + optuna 평균",                          (cat3_pred + optuna_pred) / 2),
        ("cat3 + cat7 평균",                            (cat3_pred + cat7_pred) / 2),
        ("cat3 + cat9 평균",                            (cat3_pred + cat9_pred) / 2),
        ("optuna + cat7 평균",                          (optuna_pred + cat7_pred) / 2),
        ("optuna + cat9 평균",                          (optuna_pred + cat9_pred) / 2),
        ("cat7 + cat9 평균",                            (cat7_pred + cat9_pred) / 2),
        ("cat3 + optuna + cat7 (1/3 each)",             (cat3_pred + optuna_pred + cat7_pred) / 3),
        ("cat3 + optuna + cat9 (1/3 each)",             (cat3_pred + optuna_pred + cat9_pred) / 3),
        ("cat3 + cat7 + cat9 (1/3 each)",               (cat3_pred + cat7_pred + cat9_pred) / 3),
        ("optuna + cat7 + cat9 (1/3 each)",             (optuna_pred + cat7_pred + cat9_pred) / 3),
        ("4way 평균 (cat3+optuna+cat7+cat9)",           (cat3_pred + optuna_pred + cat7_pred + cat9_pred) / 4),
        ("auto_best + cat3 (50:50)",                    (auto_best_pred + cat3_pred) / 2),
        ("auto_best + optuna (50:50)",                  (auto_best_pred + optuna_pred) / 2),
    ]

    for label, arr in methods:
        d, t1, w05, w10, score = measure_all(arr)
        print(f"  {label[:68]:70} {d:>7.2f}% {t1:>6.2f}% {score:>6.3f}")
        results.append({"label": label, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": score})

    # 정렬
    print(f"\n{'='*110}")
    print(f"🏆 점수 순위")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:68]:70} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    print(f"\n📊 카테고리별 best 매핑 (auto_best):")
    for cat, (best_k, cat_scores) in cat_best_choice.items():
        scores_str = ", ".join([f"{k}:{v:.2f}" for k, v in cat_scores.items()])
        print(f"  {cat[:25]:25} → {best_k:8} (점수: {scores_str})")

    out_path = DATA_DIR / f"cat_evo_all_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": scored, "cat_best_choice": {k: v[0] for k, v in cat_best_choice.items()}},
                  f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
