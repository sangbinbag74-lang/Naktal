"""박상빈님 5/19 cat3 발전 방향 #1/#2/#3/#5/#8 통합 측정.

#1 카테고리별 가중 fine-tune (Optuna) — 50:50 외 다양한 비율 탐색
#2 cat3 + #9 독립 ML 결합 — 작은 카테고리는 #9
#3 카테고리 세분화 (시설공사 → 발주처 N≥100 / N<100 분리)
#5 카테고리별 noise sigma — std 큰 카테고리 = sigma ↑
#8 박스권 dynamic q 선택 — 카테고리별 best q (60/65/70/75/80)
"""
import sys, io, time, json, re
from itertools import product
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

    # 모델 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 모델 추론…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q50",   "sajung_quantile_q50_new.pkl"),
        ("B_q60",   "sajung_quantile_q60_new.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
        ("B_q80",   "sajung_quantile_q80_new.pkl"),
        ("B_q90",   "sajung_quantile_q90_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  {name}: 평균 {preds[name].mean():.3f}%")

    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    preds["B_q70_q60"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q60"]
    preds["B_q70_q80"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q80"]
    preds["B_q60_q70_q80"] = (preds["B_q60"] + preds["B_q70"] + preds["B_q80"]) / 3

    # cat9 (카테고리별 독립 ML)
    print(f"\n[{time.strftime('%H:%M:%S')}] 카테고리별 독립 ML (#9) 적용…", flush=True)
    cat9_pred = np.copy(preds["B_q70_M1"])
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        model_path = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        if not model_path.exists(): continue
        cat9_pred[idx] = predict_one(model_path, df.iloc[idx])
    preds["cat9"] = cat9_pred

    # cat3 base (현재 운영)
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
    preds["cat3"] = cat3_pred

    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100
    aValue = df["aValueTotal"].values
    bsisAmt = df["bsisAmt"].values

    def measure(pred_arr, idx=None):
        if idx is None:
            idx = np.arange(len(df))
        p = pred_arr[idx]; yi = y[idx]; lwi = lwlt[idx]
        avi = aValue[idx]; bsi = bsisAmt[idx]
        estimated = bsi * (p / 100)
        opt = (estimated - avi) * lwi + avi
        actual_est = bsi * (yi / 100)
        real_lower = (actual_est - avi) * lwi + avi
        disq = (opt < real_lower).mean() * 100
        dev = np.abs(p - yi)
        return disq, (dev <= 0.05).mean() * 100, (dev <= 0.5).mean() * 100, (dev <= 1.0).mean() * 100

    results = []
    # 기준
    for k in ["cat3", "B_q70_M1", "cat9", "B_q70"]:
        d, t1, w05, w10 = measure(preds[k])
        results.append({"label": f"기준: {k}", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # #1 카테고리별 가중 fine-tune (Optuna)
    print(f"\n[{time.strftime('%H:%M:%S')}] #1 카테고리별 가중 fine-tune (Optuna)…", flush=True)
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    # 각 카테고리에서 (B_q70 가중, B_q60 가중, B_q80 가중, M1 가중) 자동 탐색 — 합 1.0
    cat1_pred = np.copy(preds["B_q70_M1"])
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
        cat1_pred[idx] = cmat.T @ best_w
    d, t1, w05, w10 = measure(cat1_pred)
    results.append({"label": "#1 카테고리별 Optuna 자동 가중 (200 trial × 15 cat)", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # #2 cat3 + #9 결합 (작은 카테고리만 #9 사용)
    print(f"\n[{time.strftime('%H:%M:%S')}] #2 cat3 + #9 (작은 카테고리만 #9)…", flush=True)
    cat2_pred = np.copy(cat3_pred)
    # 점수 높은 작은 카테고리 = 도장 / 지반 / 조경식재 등
    small_cats_with_high_score = ["도장습식방수석공사", "지반조성포장공사", "조경식재공사",
                                   "전기공사", "철근콘크리트공사", "구조물해체비계공사",
                                   "토목공사", "실내건축공사"]
    for cat in small_cats_with_high_score:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) == 0: continue
        cat2_pred[idx] = preds["cat9"][idx]
    d, t1, w05, w10 = measure(cat2_pred)
    results.append({"label": "#2 cat3 + #9 (8 카테고리 #9 사용)", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # #3 카테고리 세분화 (시설공사 → 발주처 N>=100 vs N<100)
    print(f"\n[{time.strftime('%H:%M:%S')}] #3 시설공사 세분화 (발주처 N≥100 vs N<100)…", flush=True)
    org_cnt = df.groupby("orgName").size()
    big_org_set = set(org_cnt[org_cnt >= 100].index)
    cat3_v2_pred = np.copy(cat3_pred)
    siseol_idx = np.where(df["category"].values == "시설공사")[0]
    # 시설공사 + 큰 발주처 = B-q70 + B-q80 (안전 박스권)
    # 시설공사 + 작은 발주처 = B-q70-M1 (기존)
    big_org_idx = [i for i in siseol_idx if df.iloc[i]["orgName"] in big_org_set]
    small_org_idx = [i for i in siseol_idx if df.iloc[i]["orgName"] not in big_org_set]
    # 측정: 큰 발주처는 B-q70+q80, 작은 = B-q70-M1
    cat3_v2_pred_a = np.copy(cat3_pred)
    cat3_v2_pred_a[big_org_idx] = preds["B_q70_q80"][big_org_idx]
    d, t1, w05, w10 = measure(cat3_v2_pred_a)
    results.append({"label": "#3a 시설공사 큰발주처 → B-q70+q80", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    cat3_v2_pred_b = np.copy(cat3_pred)
    cat3_v2_pred_b[big_org_idx] = preds["B_q70_q60"][big_org_idx]
    d, t1, w05, w10 = measure(cat3_v2_pred_b)
    results.append({"label": "#3b 시설공사 큰발주처 → B-q70+q60", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # #5 카테고리별 noise sigma
    print(f"\n[{time.strftime('%H:%M:%S')}] #5 카테고리별 noise sigma…", flush=True)
    # 카테고리별 std 계산 (LOO 어려움 = 단순 그룹 std 사용)
    cat_std = df.groupby("category")["actualSajung"].std().fillna(0.7)
    rng = np.random.default_rng(42)
    cat5_pred = np.copy(cat3_pred)
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        std_c = cat_std[cat] if cat in cat_std.index else 0.7
        # sigma = std × 0.04 (대략 std/25, 적당한 노이즈)
        sigma = min(0.05, max(0.02, std_c * 0.04))
        noise = np.abs(rng.normal(0, sigma, len(idx)))
        cat5_pred[idx] = cat3_pred[idx] + noise
    d, t1, w05, w10 = measure(cat5_pred)
    results.append({"label": "#5 cat3 + 카테고리별 noise (std×0.04)", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # #8 박스권 dynamic q 선택 (카테고리별 best q)
    print(f"\n[{time.strftime('%H:%M:%S')}] #8 박스권 dynamic q…", flush=True)
    # 각 카테고리에서 q50/q60/q70/q80/q90 단독 측정 → best 선택
    cat8_pred = np.copy(preds["B_q70_M1"])
    cat8_map = {}
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        if len(idx) < 500: continue
        cands = {"B_q50": preds["B_q50"], "B_q60": preds["B_q60"],
                 "B_q70": preds["B_q70"], "B_q80": preds["B_q80"],
                 "B_q90": preds["B_q90"]}
        best_score = -999; best_k = "B_q70"
        for k, p in cands.items():
            d, t1, _, _ = measure(p, idx)
            sc = t1 - d * 0.05
            if sc > best_score:
                best_score = sc; best_k = k
        cat8_map[cat] = best_k
        cat8_pred[idx] = preds[best_k][idx]
    d, t1, w05, w10 = measure(cat8_pred)
    results.append({"label": f"#8 카테고리별 best q (단독)", "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": t1 - d*0.05})

    # 종합 표
    print(f"\n{'='*110}")
    print(f"🏆 cat3 발전 방향 #1/#2/#3/#5/#8 측정 결과")
    print(f"{'='*110}")
    print(f"\n{'변형':60} {'부적격':>9} {'1위':>9} {'진입±0.5':>9} {'진입±1.0':>9} {'점수':>7}")
    print("-" * 110)
    scored = sorted(results, key=lambda r: -r["score"])
    for r in scored:
        print(f"  {r['label'][:58]:60} {r['disq']:>8.2f}% {r['top1']:>8.2f}% {r['win_05']:>8.2f}% {r['win_10']:>8.2f}% {r['score']:>6.3f}")

    print(f"\n#8 카테고리별 best q 매핑:")
    for cat, k in cat8_map.items():
        print(f"  {cat:25} → {k}")

    out_path = DATA_DIR / f"cat3_evolution_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": scored, "cat8_map": cat8_map}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
