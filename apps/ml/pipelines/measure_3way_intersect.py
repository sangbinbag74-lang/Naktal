"""박상빈님 5/19 — 3개 AI 교집합 4가지 측정.

A1: B-q70 + M1(5way) + ML-q95 (3 paradigm)
A2: B-q60 + B-q70 + B-q80 (3 quantile)
A3: B-q70 + C-grid + M1 (분류 paradigm 추가)
A4: v2 + B-q70 + C-grid (3 algorithm)

각각 변형:
  - 단순 평균 (각 1/3)
  - 일치 강도 기반 (std < 0.5%p 시 평균, std 큰 경우 B-q70 폴백)
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
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  [{time.strftime('%H:%M:%S')}] {name}: 평균 {preds[name].mean():.3f}%", flush=True)

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
    preds["C_argmax"] = candidate_grid[probs_per_cand.argmax(axis=1)]
    print(f"  C-grid-argmax: 평균 {preds['C_argmax'].mean():.3f}%", flush=True)

    # M1 합성
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)

    # 4가지 교집합 정의
    intersections = {
        "A1": ("B-q70 + M1 + ML-q95",          [preds["B_q70"], preds["M1"], preds["q95_old"]]),
        "A2": ("B-q60 + B-q70 + B-q80",        [preds["B_q60"], preds["B_q70"], preds["B_q80"]]),
        "A3": ("B-q70 + C-grid + M1",          [preds["B_q70"], preds["C_argmax"], preds["M1"]]),
        "A4": ("v2 + B-q70 + C-grid",          [preds["v2"], preds["B_q70"], preds["C_argmax"]]),
    }

    # 변형: 단순 평균 + 일치 강도 기반
    THRESHOLD = 0.5  # std 임계값 (단위 %p)
    bq70 = preds["B_q70"]

    for key, (label, arr_list) in intersections.items():
        stacked = np.stack(arr_list)  # shape (3, N)
        avg = stacked.mean(axis=0)
        std = stacked.std(axis=0)
        # 일치 강도 기반: std < THRESHOLD 면 avg, 아니면 B-q70 폴백
        consensus_mask = std < THRESHOLD
        consensus = np.where(consensus_mask, avg, bq70)
        preds[f"{key}_avg"] = avg
        preds[f"{key}_consensus"] = consensus
        preds[f"{key}_std_mean"] = std.mean()
        print(f"  {key}: 평균 std {std.mean():.4f}%p, 일치 강도 (std<0.5) 비율 {consensus_mask.mean()*100:.2f}%")

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
    print(f"📊 3개 AI 교집합 4가지 측정")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    # 기준
    methods = [
        ("== 기준 ==", None),
        ("B-q70-M1 (현재 운영중)",            "B_q70_M1_now"),
        ("B-q70 단독",                        "B_q70"),
        ("", None),
    ]
    # 기준 합성
    preds["B_q70_M1_now"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]

    for key, (label, _) in intersections.items():
        methods.append((f"== {key}. {label} ==", None))
        methods.append((f"{key} 단순평균 (1/3 each)", f"{key}_avg"))
        methods.append((f"{key} 일치강도 (std<0.5 → 평균, 아니면 B-q70)", f"{key}_consensus"))
        methods.append(("", None))

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

    print(f"\n{'='*110}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1±0.05 - disq*0.05)")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"3way_intersect_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
