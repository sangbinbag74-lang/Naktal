"""박상빈님 5/19 — 그룹 median 기반 4가지 변형 측정.

변형:
  A. 그룹 median + ML 적응형: N>=30 → group median, N<30 → B-q70-M1 폴백
  B. 가중 결합: w_grp = min(N/100, 1) × group_median + (1-w_grp) × B-q70-M1
  C. 그룹 median 계층 폴백: 발주처+카테고리(N>=30) → 발주처(N>=30) → 카테고리 → 전체
  D. 145K 전체 부적격율 측정 (위 + 현재 운영)

주의: leave-self-out (자기 제외) median 적용 — 작은 그룹 정확 측정.
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


def loo_median_vec(group_values):
    """leave-self-out median (자기 제외)
    그룹별 정렬 후 자기 제외 median 계산 — 벡터화 (각 그룹 1회 정렬)"""
    arr = group_values.values
    idx = group_values.index
    n = len(arr)
    if n == 1:
        return pd.Series([arr[0]] * n, index=idx)  # 자기밖에 없음
    # 정렬된 array
    sorted_idx = np.argsort(arr)
    sorted_arr = arr[sorted_idx]
    # 각 row 가 정렬된 array 의 어느 위치
    rank = np.empty(n, dtype=int)
    rank[sorted_idx] = np.arange(n)
    # 자기 제외 시 남은 N-1 의 median
    result = np.zeros(n)
    half = (n - 1) // 2
    for i in range(n):
        r = rank[i]
        # 자기 빼고 N-1 array 의 median index
        if (n - 1) % 2 == 1:  # N-1 홀수
            mid = half
            if r <= mid:
                result[i] = sorted_arr[mid + 1] if mid + 1 < n else sorted_arr[mid]
            else:
                result[i] = sorted_arr[mid]
        else:  # N-1 짝수, 2 중앙값 평균
            m1, m2 = half, half + 1
            if r <= m1:
                # 자기 빠지면 새 m1, m2 = m1+1, m2+1
                vals = (sorted_arr[m1 + 1], sorted_arr[m2 + 1] if m2 + 1 < n else sorted_arr[m2])
            elif r <= m2:
                vals = (sorted_arr[m1], sorted_arr[m2 + 1] if m2 + 1 < n else sorted_arr[m2])
            else:
                vals = (sorted_arr[m1], sorted_arr[m2])
            result[i] = (vals[0] + vals[1]) / 2
    return pd.Series(result, index=idx)


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

    # ML 추론 (B-q70-M1 합성용 + B-q70 단독)
    print(f"\n[{time.strftime('%H:%M:%S')}] 6 모델 추론…", flush=True)
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("cat",     "sajung_catboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
    ]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    print(f"  B-q70-M1: 평균 {preds['B_q70_M1'].mean():.3f}%")

    # 그룹별 leave-self-out median 계산 (3 레벨)
    print(f"\n[{time.strftime('%H:%M:%S')}] LOO median 계산 (3 레벨)…", flush=True)

    # Level 1: 발주처+카테고리
    g_oc = df.groupby(["orgName", "category"])["actualSajung"]
    df["loo_oc_median"] = g_oc.apply(loo_median_vec).reset_index(level=[0, 1], drop=True)
    df["oc_n"] = g_oc.transform("count")
    print(f"  Level 1 (발주처+카테고리) 완료")

    # Level 2: 발주처
    g_org = df.groupby("orgName")["actualSajung"]
    df["loo_org_median"] = g_org.apply(loo_median_vec).reset_index(level=0, drop=True)
    df["org_n"] = g_org.transform("count")
    print(f"  Level 2 (발주처) 완료")

    # Level 3: 카테고리
    g_cat = df.groupby("category")["actualSajung"]
    df["loo_cat_median"] = g_cat.apply(loo_median_vec).reset_index(level=0, drop=True)
    df["cat_n"] = g_cat.transform("count")
    print(f"  Level 3 (카테고리) 완료")

    # 변형 A: N>=30 → group median, N<30 → B-q70-M1
    preds["A_hybrid_30"] = np.where(
        df["oc_n"] >= 30,
        df["loo_oc_median"].values,
        preds["B_q70_M1"]
    )

    # 변형 B: smooth weighting (w_grp = min(N/100, 1))
    w_grp = (df["oc_n"] / 100).clip(upper=1.0).values
    preds["B_smooth_weight"] = w_grp * df["loo_oc_median"].values + (1 - w_grp) * preds["B_q70_M1"]

    # 변형 C: 그룹 median 계층 폴백 (oc N>=30 → org N>=30 → cat → 전체)
    preds["C_hier_fallback"] = np.where(
        df["oc_n"] >= 30, df["loo_oc_median"].values,
        np.where(df["org_n"] >= 30, df["loo_org_median"].values,
                 df["loo_cat_median"].values)  # 카테고리 최소 N 충분 (전체 145K 표본 = 카테고리 모두 100+)
    )

    # 변형 D: 그룹 median 단독 (소규모 그룹도 LOO median, 매우 위험)
    preds["D_median_solo"] = df["loo_oc_median"].values

    # 변형 추가: 위 변형 + B-q70-M1 ensemble
    preds["A_hybrid_ensemble"] = 0.5 * preds["A_hybrid_30"] + 0.5 * preds["B_q70_M1"]
    preds["B_smooth_ensemble"] = 0.5 * preds["B_smooth_weight"] + 0.5 * preds["B_q70_M1"]
    preds["C_hier_ensemble"]   = 0.5 * preds["C_hier_fallback"] + 0.5 * preds["B_q70_M1"]

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
    print(f"📊 그룹 median 기반 변형 측정 (145K 전체)")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    methods = [
        ("== 기준 ==", None),
        ("B-q70-M1 (현재 운영중)",                          "B_q70_M1"),
        ("B-q70 단독",                                      "B_q70"),
        ("", None),
        ("== 그룹 median 변형 (단독) ==", None),
        ("A. Hybrid (N≥30 group median, N<30 ML)",         "A_hybrid_30"),
        ("B. Smooth weight (w=N/100, 부드러운 결합)",       "B_smooth_weight"),
        ("C. 계층 폴백 (oc→org→cat)",                       "C_hier_fallback"),
        ("D. 그룹 median 단독 (소규모 위험)",                "D_median_solo"),
        ("", None),
        ("== 그룹 median + B-q70-M1 ensemble (50:50) ==", None),
        ("A + B-q70-M1 (50:50)",                            "A_hybrid_ensemble"),
        ("B + B-q70-M1 (50:50)",                            "B_smooth_ensemble"),
        ("C + B-q70-M1 (50:50)",                            "C_hier_ensemble"),
    ]

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

    # 그룹 분포 보고
    print(f"\n그룹 size 분포:")
    print(f"  발주처+카테고리 N≥30: {(df['oc_n']>=30).sum():,}건 ({(df['oc_n']>=30).mean()*100:.1f}%)")
    print(f"  발주처+카테고리 N 1~29: {(df['oc_n']<30).sum():,}건 ({(df['oc_n']<30).mean()*100:.1f}%)")
    print(f"  발주처 N≥30: {(df['org_n']>=30).sum():,}건 ({(df['org_n']>=30).mean()*100:.1f}%)")

    print(f"\n{'='*110}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1±0.05 - disq*0.05)")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"group_median_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
