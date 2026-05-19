"""박상빈님 5/20 — 기존 ML + 신규 ML 모두 비교 + 4 지표 (부적격/1위/진입0.5/진입1.0).

대상 ML:
  기존: v2 / tuned / xgb / cat / q95_old / M1 / M1-N03 / B-q70-M1
  박스권 B: q05/q10/q20/q30/q40/q50/q60/q70/q80/q90/q95 (11개)
  fine B: q65/q68/q72/q75 (4개)
  C-grid-argmax (분류)
  카테고리별: cat9 / cat7 / cat3 / Optuna 200 / Optuna 10K / Optuna 9모델 / auto_best_16
  학습된: Custom loss / multi-output / 시설공사 big_org / 시설공사 small_org / Stacking
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
    try:
        return booster.predict(X.values)
    except Exception as e:
        print(f"  [SKIP {model_path.name}] {e}")
        return None


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
    # 기존 ML
    print(f"\n[{time.strftime('%H:%M:%S')}] 기존 ML 추론…", flush=True)
    for name, fn in [
        ("v2", "sajung_lgbm_v2.pkl"),
        ("tuned", "sajung_lgbm_v3_tuned.pkl"),
        ("xgb", "sajung_xgboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
    ]:
        p = predict_one(MODEL_DIR / fn, df)
        if p is not None: preds[name] = p

    # B 박스권 11 + fine 4
    print(f"\n[{time.strftime('%H:%M:%S')}] B 박스권 + fine quantile…", flush=True)
    for q in ["q05", "q10", "q20", "q30", "q40", "q50", "q60", "q65", "q68", "q70", "q72", "q75", "q80", "q90", "q95"]:
        p = predict_one(MODEL_DIR / f"sajung_quantile_{q}_new.pkl", df)
        if p is not None: preds[f"B_{q}"] = p

    # M1 + 변형
    m1_w = np.array([0.15, 0.15, 0.10, 0.60])
    P4 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"]])
    preds["M1"] = (P4.T @ m1_w)
    rng = np.random.default_rng(42)
    noise_003 = np.abs(rng.normal(0, 0.03, len(df)))
    preds["M1_N03"] = preds["M1"] + noise_003
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    preds["B_q70_N03"] = preds["B_q70"] + noise_003

    # 카테고리별 모델
    print(f"\n[{time.strftime('%H:%M:%S')}] 카테고리별 모델…", flush=True)
    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    cat9_pred = np.copy(preds["B_q70_M1"])
    cat7_pred = np.copy(preds["B_q70_M1"])
    for cat in big_cats:
        idx = np.where(df["category"].values == cat)[0]
        m9 = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        m7 = MODEL_DIR / f"sajung_q70_cat_time_{slug(cat)}.pkl"
        if m9.exists():
            p = predict_one(m9, df.iloc[idx])
            if p is not None: cat9_pred[idx] = p
        if m7.exists():
            p = predict_one(m7, df.iloc[idx])
            if p is not None: cat7_pred[idx] = p
    preds["cat9"] = cat9_pred
    preds["cat7"] = cat7_pred

    # cat3 (운영중)
    cat_best_v = {
        "시설공사": "B_q70_M1", "전기공사": "B_q70_q60", "토목공사": "B_q70_M1",
        "건축공사": "B_q70_q80", "실내건축공사": "B_q70", "기계설비공사": "B_q70_M1",
        "지반조성포장공사": "B_q70_q60", "상하수도설비공사": "B_q70_M1",
        "도장습식방수석공사": "B_q70_q80", "통신공사": "B_q70_M1",
        "조경식재공사": "B_q60_q70_q80", "소방시설공사": "B_q70_M1",
        "조경공사": "B_q70_M1", "철근콘크리트공사": "B_q70_q80",
        "구조물해체비계공사": "B_q70_q80",
    }
    preds["B_q70_q60"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q60"]
    preds["B_q70_q80"] = 0.5 * preds["B_q70"] + 0.5 * preds["B_q80"]
    preds["B_q60_q70_q80"] = (preds["B_q60"] + preds["B_q70"] + preds["B_q80"]) / 3
    cat3_pred = np.copy(preds["B_q70_M1"])
    for cat, vname in cat_best_v.items():
        idx = np.where(df["category"].values == cat)[0]
        cat3_pred[idx] = preds[vname][idx]
    preds["cat3"] = cat3_pred

    # Optuna 결과 (저장된 JSON 사용)
    print(f"\n[{time.strftime('%H:%M:%S')}] Optuna 결과 (저장 JSON 사용)…", flush=True)
    def load_optuna_pred(json_pattern):
        files = sorted(DATA_DIR.glob(json_pattern), key=lambda f: -f.stat().st_mtime)
        if not files: return None
        try:
            data = json.load(open(files[0], encoding="utf-8"))
            return data.get("cat_weights", {})
        except Exception:
            return None

    # Optuna 가중치 자체로 145K 추론
    def apply_optuna(cat_weights, comp_keys):
        if cat_weights is None: return None
        pred = np.copy(preds["B_q70_M1"])
        for cat, weights in cat_weights.items():
            idx = np.where(df["category"].values == cat)[0]
            if len(idx) == 0: continue
            cmat = np.stack([preds[k][idx] for k in comp_keys if k in preds], axis=0)
            w = np.array([weights[k] for k in comp_keys if k in weights])
            w = w / w.sum() if w.sum() > 0 else w
            pred[idx] = cmat.T @ w
        return pred

    optuna_200 = apply_optuna(load_optuna_pred("optuna_weights_*.json"), ["B_q70", "B_q60", "B_q80", "M1"])
    optuna_10k = apply_optuna(load_optuna_pred("improve_3_*.json"), ["B_q70", "B_q60", "B_q80", "M1"])
    optuna_9 = apply_optuna(load_optuna_pred("improve_4_*.json"),
                             ["B_q60", "B_q65", "B_q68", "B_q70", "B_q72", "B_q75", "B_q80", "M1", "q95_old"])
    if optuna_200 is not None: preds["optuna_200"] = optuna_200
    if optuna_10k is not None: preds["optuna_10K"] = optuna_10k
    if optuna_9 is not None: preds["optuna_9mod"] = optuna_9

    # auto_best_16 (카테고리별 16 중 best)
    if "optuna_10K" in preds:
        # 매핑 — improve_1 결과 (카테고리별)
        cat_best_choice = {
            "시설공사": "optuna_10K", "전기공사": "optuna_10K", "토목공사": "optuna_10K",
            "건축공사": "cat7", "실내건축공사": "optuna_10K", "기계설비공사": "optuna_10K",
            "지반조성포장공사": "cat3", "상하수도설비공사": "optuna_10K",
            "도장습식방수석공사": "cat7", "통신공사": "optuna_10K",
            "조경식재공사": "optuna_10K", "소방시설공사": "cat3",
            "조경공사": "optuna_10K", "철근콘크리트공사": "optuna_10K",
            "구조물해체비계공사": "optuna_10K",
        }
        ab_pred = np.copy(preds["B_q70_M1"])
        for cat, choice_k in cat_best_choice.items():
            idx = np.where(df["category"].values == cat)[0]
            if choice_k in preds:
                ab_pred[idx] = preds[choice_k][idx]
        preds["auto_best_16"] = ab_pred

    # 시설공사 sub
    print(f"\n[{time.strftime('%H:%M:%S')}] 시설공사 sub…", flush=True)
    org_cnt = df.groupby("orgName").size()
    big_org_set = set(org_cnt[org_cnt >= 100].index)
    siseol_idx = np.where(df["category"].values == "시설공사")[0]
    siseol_subpred = np.copy(preds["B_q70_M1"])
    m_big = MODEL_DIR / "sajung_q70_siseol_big_org.pkl"
    m_small = MODEL_DIR / "sajung_q70_siseol_small_org.pkl"
    if m_big.exists() and m_small.exists():
        big_idx = [i for i in siseol_idx if df.iloc[i]["orgName"] in big_org_set]
        small_idx = [i for i in siseol_idx if df.iloc[i]["orgName"] not in big_org_set]
        if len(big_idx) > 0:
            p = predict_one(m_big, df.iloc[big_idx])
            if p is not None: siseol_subpred[big_idx] = p
        if len(small_idx) > 0:
            p = predict_one(m_small, df.iloc[small_idx])
            if p is not None: siseol_subpred[small_idx] = p
        preds["siseol_sub"] = siseol_subpred

    # C-grid-argmax
    print(f"\n[{time.strftime('%H:%M:%S')}] C-grid-argmax…", flush=True)
    c_path = MODEL_DIR / "sajung_classifier_grid.pkl"
    if c_path.exists():
        c_payload = joblib.load(c_path)
        c_model = c_payload["model"]; c_features = c_payload["feature_names"]
        c_cats = c_payload["categorical_cols"]; c_encs = c_payload["encoders"]
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

    # Custom loss / multi-output (선택)
    cl_path = MODEL_DIR / "sajung_custom_loss.pkl"
    if cl_path.exists():
        p = predict_one(cl_path, df)
        if p is not None: preds["custom_loss"] = p
    mo_path = MODEL_DIR / "sajung_multi_output.pkl"
    if mo_path.exists():
        mo = joblib.load(mo_path)
        # 단순화 = q70 단독만 (multi-output 결합 X)
        try:
            p = predict_one(mo_path, df)
            if p is not None: preds["multi_output_q"] = p
        except Exception:
            pass

    # Stacking
    st_path = MODEL_DIR / "sajung_stacking.pkl"
    if st_path.exists():
        st = joblib.load(st_path)
        st_model = st["model"]
        from sklearn.preprocessing import LabelEncoder
        le_cat = st["le_cat"]
        cat_id_arr = np.zeros(len(df), dtype=int)
        for i, c in enumerate(df["category"].astype(str).fillna("").values):
            if c in le_cat.classes_:
                cat_id_arr[i] = list(le_cat.classes_).index(c)
        X_stack = np.column_stack([
            preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"],
            preds["B_q50"], preds["B_q60"], preds["B_q70"], preds["B_q80"],
            preds["M1"], preds["B_q70_M1"], preds["cat9"], preds["cat7"], cat_id_arr,
        ])
        try:
            preds["stacking"] = st_model.predict(X_stack, num_iteration=st_model.best_iteration)
        except Exception as e:
            print(f"  Stacking 추론 실패: {e}")

    # 측정
    y = df["actualSajung"].values
    lwlt = df["lwlt"].values / 100; aValue = df["aValueTotal"].values; bsisAmt = df["bsisAmt"].values

    def measure(arr):
        estimated = bsisAmt * (arr / 100)
        opt = (estimated - aValue) * lwlt + aValue
        actual_est = bsisAmt * (y / 100); rl = (actual_est - aValue) * lwlt + aValue
        d = (opt < rl).mean() * 100
        dev = np.abs(arr - y)
        return d, (dev <= 0.05).mean() * 100, (dev <= 0.5).mean() * 100, (dev <= 1.0).mean() * 100

    print(f"\n{'='*120}")
    print(f"🏆 기존 ML + 신규 ML 모두 비교 (4 지표: 부적격율 / 1위±0.05%p / 진입±0.5%p / 진입±1.0%p)")
    print(f"{'='*120}")
    print(f"\n{'분류':12} {'모델':45} {'부적격':>9} {'1위':>9} {'진입0.5':>9} {'진입1.0':>9} {'점수':>9}")
    print("-" * 120)

    groups = [
        ("기존 5way 재료", ["v2", "tuned", "xgb", "q95_old", "M1", "M1_N03"]),
        ("박스권 B 11", ["B_q05", "B_q10", "B_q20", "B_q30", "B_q40", "B_q50",
                          "B_q60", "B_q70", "B_q80", "B_q90", "B_q95"]),
        ("박스권 B fine", ["B_q65", "B_q68", "B_q72", "B_q75"]),
        ("운영(직전)", ["B_q70_M1", "B_q70_N03"]),
        ("카테고리별", ["cat9", "cat7", "cat3"]),
        ("Optuna", ["optuna_200", "optuna_9mod", "optuna_10K", "auto_best_16"]),
        ("학습된 변형", ["siseol_sub", "custom_loss", "multi_output_q", "stacking"]),
        ("분류", ["C_argmax"]),
    ]
    results = []
    for group, ks in groups:
        for k in ks:
            if k not in preds: continue
            d, t1, w05, w10 = measure(preds[k])
            sc = t1 - d * 0.05
            print(f"  {group[:10]:12} {k[:43]:45} {d:>8.2f}% {t1:>8.2f}% {w05:>8.2f}% {w10:>8.2f}% {sc:>8.3f}")
            results.append({"group": group, "label": k, "disq": d, "top1": t1, "win_05": w05, "win_10": w10, "score": sc})

    print(f"\n{'='*120}")
    print(f"🏆 점수 순위 Top 20")
    print(f"{'='*120}")
    scored = sorted(results, key=lambda r: -r["score"])
    print(f"\n{'순위':>4} {'그룹':12} {'모델':45} {'부적격':>9} {'1위':>9} {'점수':>9}")
    print("-" * 120)
    for i, r in enumerate(scored[:20]):
        print(f"  {i+1:>2}   {r['group'][:10]:12} {r['label'][:43]:45} {r['disq']:>8.2f}% {r['top1']:>8.2f}% {r['score']:>8.3f}")

    out_path = DATA_DIR / f"all_ml_compare_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
