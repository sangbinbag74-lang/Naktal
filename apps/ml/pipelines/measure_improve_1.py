"""박상빈님 5/20 #1 개선 — 16 변형 카테고리별 auto_best 확장.

후보 변형:
  단독: cat3, optuna, cat9, cat7
  2way: 6 조합
  3way: 4 조합
  4way: 1 조합
  추가: B-q70-M1, B-q70 단독, B-q70+q80
  = 총 16 변형

각 카테고리에서 16 중 best 자동 선택.
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
    if not model_path.exists(): return None
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
    print(f"\n[{time.strftime('%H:%M:%S')}] 기본 모델 추론…", flush=True)
    base = [
        ("v2", "sajung_lgbm_v2.pkl"), ("tuned", "sajung_lgbm_v3_tuned.pkl"),
        ("xgb", "sajung_xgboost.pkl"), ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q50", "sajung_quantile_q50_new.pkl"),
        ("B_q60", "sajung_quantile_q60_new.pkl"),
        ("B_q70", "sajung_quantile_q70_new.pkl"),
        ("B_q80", "sajung_quantile_q80_new.pkl"),
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

    # cat3
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

    # cat9 + cat7
    print(f"\n[{time.strftime('%H:%M:%S')}] cat9 + cat7…", flush=True)
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    cat9_pred = np.copy(preds["B_q70_M1"])
    cat7_pred = np.copy(preds["B_q70_M1"])
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        m9 = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        m7 = MODEL_DIR / f"sajung_q70_cat_time_{slug(cat)}.pkl"
        if m9.exists(): cat9_pred[idx] = predict_one(m9, df.iloc[idx])
        if m7.exists(): cat7_pred[idx] = predict_one(m7, df.iloc[idx])

    # Optuna 가중
    print(f"\n[{time.strftime('%H:%M:%S')}] Optuna 카테고리별 가중…", flush=True)
    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100; aValue = df["aValueTotal"].values; bsisAmt = df["bsisAmt"].values

    def measure_idx(pred_arr, idx):
        p = pred_arr[idx]; yi = y[idx]; lwi = lwlt[idx]; avi = aValue[idx]; bsi = bsisAmt[idx]
        estimated = bsi * (p / 100)
        opt = (estimated - avi) * lwi + avi
        actual_est = bsi * (yi / 100); rl = (actual_est - avi) * lwi + avi
        disq = (opt < rl).mean() * 100
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

    # 16 변형
    cand = {
        "cat3": cat3_pred,
        "optuna": optuna_pred,
        "cat9": cat9_pred,
        "cat7": cat7_pred,
        # 2way
        "cat3+optuna": (cat3_pred + optuna_pred) / 2,
        "cat3+cat9": (cat3_pred + cat9_pred) / 2,
        "cat3+cat7": (cat3_pred + cat7_pred) / 2,
        "optuna+cat9": (optuna_pred + cat9_pred) / 2,
        "optuna+cat7": (optuna_pred + cat7_pred) / 2,
        "cat9+cat7": (cat9_pred + cat7_pred) / 2,
        # 3way
        "cat3+optuna+cat9": (cat3_pred + optuna_pred + cat9_pred) / 3,
        "cat3+optuna+cat7": (cat3_pred + optuna_pred + cat7_pred) / 3,
        "cat3+cat9+cat7": (cat3_pred + cat9_pred + cat7_pred) / 3,
        "optuna+cat9+cat7": (optuna_pred + cat9_pred + cat7_pred) / 3,
        # 4way
        "all4": (cat3_pred + optuna_pred + cat9_pred + cat7_pred) / 4,
        # extra
        "B_q70_M1": preds["B_q70_M1"],
    }

    # 각 카테고리에서 16 중 best 자동 선택
    print(f"\n[{time.strftime('%H:%M:%S')}] 카테고리별 16 변형 best 선택…", flush=True)
    auto_best_pred = np.copy(preds["B_q70_M1"])
    cat_best_choice = {}
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) < 100: continue
        scores = {}
        for k, arr in cand.items():
            d, t1, _, _ = measure_idx(arr, idx)
            scores[k] = t1 - d * 0.05
        best_k = max(scores.items(), key=lambda x: x[1])[0]
        cat_best_choice[cat] = (best_k, scores[best_k])
        auto_best_pred[idx] = cand[best_k][idx]

    # 측정
    def m_all(arr):
        d, t1, w05, w10 = measure_idx(arr, np.arange(len(df)))
        return d, t1, w05, w10, t1 - d * 0.05

    results = []
    for k, arr in cand.items():
        d, t1, w05, w10, sc = m_all(arr)
        results.append({"label": k, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": sc})
    d, t1, w05, w10, sc = m_all(auto_best_pred)
    results.append({"label": "auto_best_16 (카테고리별 16 중 best)", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": sc})

    print(f"\n{'='*110}")
    print(f"🏆 #1 16 변형 + auto_best 확장")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격':>8} {'1위':>7} {'점수':>7}")
    print("-" * 110)
    scored = sorted(results, key=lambda r: -r["score"])
    for r in scored:
        print(f"  {r['label'][:48]:50} {r['disq']:>7.2f}% {r['top1']:>6.2f}% {r['score']:>6.3f}")

    print(f"\n📊 카테고리별 best (auto_best_16):")
    for cat, (best_k, sc) in cat_best_choice.items():
        print(f"  {cat[:25]:25} → {best_k:30} (점수 {sc:.2f})")

    out_path = DATA_DIR / f"improve_1_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": scored, "cat_best_choice": {k: v[0] for k, v in cat_best_choice.items()}},
                  f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
