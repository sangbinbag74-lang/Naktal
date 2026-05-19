"""박상빈님 5/19 #2 — Optuna 자동 가중 탐색.

가중 변수:
  - B-q70 / M1 / B-q60 / B-q80 / B-q50 / C-grid / q95_old (7개)
  - 합 = 1.0 정규화

목적 함수: 박상빈님 ultimate_goal 점수 (top1 ±0.05 - disq × 0.05) 최대화
TPE sampler, 1000 trial.

산수상 시간: 약 30분 (1000 trial × 10ms per measure).
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

    # 7 모델 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 7 모델 추론…", flush=True)
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
        print(f"  {name}: 평균 {preds[name].mean():.3f}%")

    # C classifier (생략 — 시간 ↑. Optuna 시간 단축)
    # M1 합성 (v2 0.15 + tuned 0.15 + xgb 0.10 + q95 0.60, cat 제외 wsum=1.0)
    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    print(f"  M1: 평균 {preds['M1'].mean():.3f}%")

    # 측정 utility
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

    # Optuna objective
    candidate_models = ["B_q70", "M1", "B_q50", "B_q60", "B_q80", "q95_old"]
    pred_matrix = np.stack([preds[k] for k in candidate_models], axis=0)  # (6, N)

    def objective(trial):
        weights = np.array([
            trial.suggest_float(f"w_{k}", 0, 1) for k in candidate_models
        ])
        if weights.sum() < 0.1:
            return -10
        weights = weights / weights.sum()  # 정규화
        ensemble = pred_matrix.T @ weights  # (N,)
        d, t1, _, _ = measure(ensemble)
        score = t1 - d * 0.05
        return score

    print(f"\n[{time.strftime('%H:%M:%S')}] Optuna 1000 trial 시작…", flush=True)
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=1000, show_progress_bar=False)

    best = study.best_trial
    best_weights_raw = np.array([best.params[f"w_{k}"] for k in candidate_models])
    best_weights = best_weights_raw / best_weights_raw.sum()
    print(f"\n[{time.strftime('%H:%M:%S')}] 최적 가중 발견:")
    for k, w in zip(candidate_models, best_weights):
        print(f"  {k}: {w:.4f}")
    print(f"\n  Best score: {best.value:.3f}")

    # 최적 가중 최종 측정
    best_ensemble = pred_matrix.T @ best_weights
    d, t1, w05, w10 = measure(best_ensemble)
    print(f"\n=== Optuna best 최종 측정 ===")
    print(f"  부적격율: {d:.2f}%")
    print(f"  1위 ±0.05%p: {t1:.2f}%")
    print(f"  진입 ±0.5%p: {w05:.2f}%")
    print(f"  진입 ±1.0%p: {w10:.2f}%")
    print(f"  점수: {t1 - d*0.05:.3f}")

    # 비교: B-q70-M1 (현재 운영)
    bq70_m1 = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    d2, t12, w052, w102 = measure(bq70_m1)
    print(f"\n=== B-q70-M1 (현재 운영, 비교) ===")
    print(f"  부적격율: {d2:.2f}%")
    print(f"  1위 ±0.05%p: {t12:.2f}%")
    print(f"  점수: {t12 - d2*0.05:.3f}")

    print(f"\n=== 차이 ===")
    print(f"  부적격율: {d - d2:+.2f}%p")
    print(f"  1위 ±0.05%p: {t1 - t12:+.2f}%p")
    print(f"  점수: {(t1 - d*0.05) - (t12 - d2*0.05):+.3f}")

    # Top 10 trial
    print(f"\n=== Top 10 trial ===")
    sorted_trials = sorted(study.trials, key=lambda t: -t.value if t.value is not None else float('inf'))[:10]
    for i, t in enumerate(sorted_trials):
        w_raw = np.array([t.params[f"w_{k}"] for k in candidate_models])
        w_norm = w_raw / w_raw.sum()
        weights_str = ", ".join([f"{k}:{w:.2f}" for k, w in zip(candidate_models, w_norm)])
        print(f"  {i+1}. score {t.value:.3f} | {weights_str}")

    out_path = DATA_DIR / f"optuna_weights_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "best_score": float(best.value),
            "best_weights": {k: float(w) for k, w in zip(candidate_models, best_weights)},
            "B_q70_M1_score": float(t12 - d2*0.05),
        }, f, indent=2, ensure_ascii=False)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
