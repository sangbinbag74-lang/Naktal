"""박상빈님 5/20 #4 개선 — Optuna 9 모델 후보 가중 (fine quantile 추가).

기존 #1 Optuna = 4 후보 (B-q70, B-q60, B-q80, M1)
신규 #4 = 9 후보:
  - B-q60, B-q65, B-q68, B-q70, B-q72, B-q75, B-q80 (fine quantile)
  - M1, q95_old
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

    # 9 모델 + M1
    print(f"\n[{time.strftime('%H:%M:%S')}] 9 모델 추론…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q60",   "sajung_quantile_q60_new.pkl"),
        ("B_q65",   "sajung_quantile_q65_new.pkl"),
        ("B_q68",   "sajung_quantile_q68_new.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
        ("B_q72",   "sajung_quantile_q72_new.pkl"),
        ("B_q75",   "sajung_quantile_q75_new.pkl"),
        ("B_q80",   "sajung_quantile_q80_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  {name}: 평균 {preds[name].mean():.3f}%")
    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]

    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100; aValue = df["aValueTotal"].values; bsisAmt = df["bsisAmt"].values
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()

    def measure_idx(pred_arr, idx):
        p = pred_arr[idx]; yi = y[idx]; lwi = lwlt[idx]; avi = aValue[idx]; bsi = bsisAmt[idx]
        estimated = bsi * (p / 100); o = (estimated - avi) * lwi + avi
        ae = bsi * (yi / 100); rl = (ae - avi) * lwi + avi
        d = (o < rl).mean() * 100
        dev = np.abs(p - yi)
        return d, (dev <= 0.05).mean() * 100, (dev <= 0.5).mean() * 100, (dev <= 1.0).mean() * 100

    # Optuna 9 모델 가중 (카테고리별)
    print(f"\n[{time.strftime('%H:%M:%S')}] Optuna 9 모델 카테고리별 가중 (500 trial × 15 cat)…", flush=True)
    optuna9_pred = np.copy(preds["B_q70_M1"])
    cat_weights = {}
    comp = ["B_q60", "B_q65", "B_q68", "B_q70", "B_q72", "B_q75", "B_q80", "M1", "q95_old"]
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) < 500: continue
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
        st.optimize(obj, n_trials=500, show_progress_bar=False)
        best_w = np.array([st.best_params[c] for c in comp])
        best_w /= best_w.sum()
        optuna9_pred[idx] = cmat.T @ best_w
        cat_weights[cat] = {c: float(w) for c, w in zip(comp, best_w)}
        print(f"  [{cat[:15]:15}] {st.best_value:.3f}")

    # 측정
    d, t1, w05, w10 = measure_idx(optuna9_pred, np.arange(len(df)))
    score = t1 - d * 0.05
    print(f"\n{'='*100}")
    print(f"🏆 #4 Optuna 9 모델 카테고리별 가중")
    print(f"{'='*100}")
    print(f"  부적격: {d:.2f}%")
    print(f"  1위 ±0.05%p: {t1:.2f}%")
    print(f"  진입 ±0.5%p: {w05:.2f}%")
    print(f"  진입 ±1.0%p: {w10:.2f}%")
    print(f"  점수: {score:.3f}")
    print(f"\n비교 (기존):")
    print(f"  - cat3 (현재 운영): 3.456")
    print(f"  - optuna (4 모델 200 trial, #1): 3.557")
    print(f"  - auto_best_16 (카테고리별 16 best, #1 신규): 3.577")
    print(f"  - 본 #4 (9 모델 500 trial): {score:.3f}")

    out_path = DATA_DIR / f"improve_4_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "score": float(score), "disq": float(d), "top1": float(t1),
            "cat_weights": cat_weights,
        }, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
