"""박상빈님 5/19 — 발주처-카테고리 그룹별 사정율 분포 상세 분석.

분석 항목:
  1. 그룹 수 (orgName × category 조합)
  2. sampleSize 분포 (큰 그룹 vs 작은 그룹)
  3. 그룹별 mean/median/std/mode/quantile 통계
  4. 그룹 간 분포 차이 (발주처마다 다른지, 카테고리마다 다른지)
  5. 각 그룹의 최적 추천 통계량 (mean/median/mode/q70 중 무엇이 정확한지)
  6. 그룹별 B-q70-M1 vs 실제 차이 (분포에서 ML이 어디 위치하는지)
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
from scipy.stats import gaussian_kde

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

    # 카테고리 분포
    print(f"\n{'='*95}")
    print(f"📊 1. 카테고리 분포")
    print(f"{'='*95}")
    cat_counts = df["category"].value_counts()
    print(f"카테고리 수: {len(cat_counts)}개")
    print(f"\n{'카테고리':40} {'건수':>8} {'비율':>8}")
    print("-" * 60)
    for cat, cnt in cat_counts.head(20).items():
        print(f"  {cat[:38]:40} {cnt:>8,} {cnt/len(df)*100:>7.2f}%")

    # 발주처 분포
    print(f"\n{'='*95}")
    print(f"📊 2. 발주처 분포")
    print(f"{'='*95}")
    org_counts = df["orgName"].value_counts()
    print(f"발주처 수: {len(org_counts):,}개")
    print(f"발주처별 건수 분포:")
    print(f"  N≥100건: {(org_counts >= 100).sum():,}개 발주처")
    print(f"  N 30~99건: {((org_counts >= 30) & (org_counts < 100)).sum():,}개")
    print(f"  N 10~29건: {((org_counts >= 10) & (org_counts < 30)).sum():,}개")
    print(f"  N 1~9건: {(org_counts < 10).sum():,}개")

    # 발주처+카테고리 그룹
    print(f"\n{'='*95}")
    print(f"📊 3. 발주처+카테고리 그룹")
    print(f"{'='*95}")
    org_cat = df.groupby(["orgName", "category"])
    grp_counts = org_cat.size()
    print(f"발주처+카테고리 그룹 수: {len(grp_counts):,}개")
    print(f"그룹별 건수 분포:")
    print(f"  N≥100건: {(grp_counts >= 100).sum():,}개 그룹 ({(grp_counts >= 100).sum()/len(grp_counts)*100:.1f}%)")
    print(f"  N 30~99건: {((grp_counts >= 30) & (grp_counts < 100)).sum():,}개")
    print(f"  N 10~29건: {((grp_counts >= 10) & (grp_counts < 30)).sum():,}개")
    print(f"  N 1~9건: {(grp_counts < 10).sum():,}개")
    print(f"  최대 그룹 N: {grp_counts.max():,}")
    print(f"  평균 그룹 N: {grp_counts.mean():.1f}")
    print(f"  중앙 그룹 N: {grp_counts.median():.0f}")

    # 그룹별 사정율 통계
    print(f"\n{'='*95}")
    print(f"📊 4. 그룹별 사정율 통계 (N>=30 인 그룹만)")
    print(f"{'='*95}")
    grp_stats = org_cat["actualSajung"].agg(["mean", "median", "std", "min", "max", "count"])
    grp_big = grp_stats[grp_stats["count"] >= 30]
    print(f"N>=30 그룹 수: {len(grp_big):,}개")
    print(f"\n그룹별 평균 사정율 분포 (큰 그룹만):")
    print(f"  전체 평균: {grp_big['mean'].mean():.3f}%")
    print(f"  그룹 평균의 std: {grp_big['mean'].std():.4f}%p (그룹 간 차이)")
    print(f"  최소 그룹 평균: {grp_big['mean'].min():.3f}%")
    print(f"  최대 그룹 평균: {grp_big['mean'].max():.3f}%")
    print(f"\n그룹 내 분산:")
    print(f"  그룹 내 std 평균: {grp_big['std'].mean():.4f}%p")
    print(f"  그룹 내 std 중앙: {grp_big['std'].median():.4f}%p")
    print(f"  → 같은 발주처+카테고리 안에서도 사정율 {grp_big['std'].mean():.3f}%p 분산")

    # 카테고리별 사정율 통계
    print(f"\n{'='*95}")
    print(f"📊 5. 카테고리별 사정율 통계 (전체 그룹 비교)")
    print(f"{'='*95}")
    cat_stats = df.groupby("category")["actualSajung"].agg(["mean", "median", "std", "count"])
    cat_stats = cat_stats[cat_stats["count"] >= 100].sort_values("mean")
    print(f"\n{'카테고리':40} {'평균':>8} {'중앙':>8} {'std':>8} {'건수':>10}")
    print("-" * 80)
    for cat, row in cat_stats.iterrows():
        print(f"  {cat[:38]:40} {row['mean']:>7.3f}% {row['median']:>7.3f}% {row['std']:>7.4f} {int(row['count']):>10,}")

    # 가장 큰 그룹들 — 상세 분석
    print(f"\n{'='*95}")
    print(f"📊 6. 가장 큰 발주처+카테고리 그룹 Top 15 (분포 상세)")
    print(f"{'='*95}")
    big_groups = grp_counts.sort_values(ascending=False).head(15)
    # B-q70 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] B-q70 추론…", flush=True)
    bq70 = predict_one(MODEL_DIR / "sajung_quantile_q70_new.pkl", df)
    df["B_q70"] = bq70

    print(f"\n{'발주처':30} {'카테고리':20} {'N':>5} {'평균':>7} {'중앙':>7} {'mode':>7} {'std':>6} {'B-q70 평균':>10}")
    print("-" * 110)
    for (org, cat), n in big_groups.items():
        sub = df[(df["orgName"] == org) & (df["category"] == cat)]
        sajung = sub["actualSajung"].values
        bq70_mean = sub["B_q70"].mean()
        # KDE mode
        try:
            kde = gaussian_kde(sajung, bw_method=0.1)
            xs = np.linspace(np.percentile(sajung, 5), np.percentile(sajung, 95), 200)
            mode_x = xs[np.argmax(kde(xs))]
        except Exception:
            mode_x = np.median(sajung)
        print(f"  {str(org)[:28]:30} {str(cat)[:18]:20} {n:>5} {sajung.mean():>6.3f}% {np.median(sajung):>6.3f}% {mode_x:>6.3f}% {sajung.std():>5.4f} {bq70_mean:>9.3f}%")

    # 그룹별 어느 통계량이 가장 정확한지
    print(f"\n{'='*95}")
    print(f"📊 7. 그룹별 통계량 정확도 비교 (N>=30, leave-self-out)")
    print(f"{'='*95}")

    # 그룹별 leave-self-out mean/median/mode
    print(f"\n[{time.strftime('%H:%M:%S')}] 그룹별 leave-self-out 통계 계산…", flush=True)

    # 큰 그룹 (N>=30) 만 leave-self-out
    big_keys = set((org, cat) for (org, cat), n in grp_counts.items() if n >= 30)
    df["is_big_group"] = df.apply(lambda r: (r["orgName"], r["category"]) in big_keys, axis=1)
    df_big = df[df["is_big_group"]].copy()

    # leave-self-out mean
    g = df_big.groupby(["orgName", "category"])["actualSajung"]
    sum_t = g.transform("sum")
    cnt_t = g.transform("count")
    df_big["loo_mean"] = (sum_t - df_big["actualSajung"]) / (cnt_t - 1).clip(lower=1)

    # leave-self-out median (느릴 수 있음, 단순화: median = mean 근사)
    df_big["loo_median"] = g.transform("median")  # leakage 약간 있음

    # B-q70 + M1 (현재 운영)
    base = [("v2", "sajung_lgbm_v2.pkl"), ("tuned", "sajung_lgbm_v3_tuned.pkl"),
            ("xgb", "sajung_xgboost.pkl"), ("cat", "sajung_catboost.pkl"),
            ("q95_old", "sajung_quantile_q95.pkl")]
    preds = {}
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df_big)
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    df_big["m1"] = (P5.T @ m1_w)
    df_big["b_q70_m1"] = 0.5 * df_big["B_q70"].values + 0.5 * df_big["m1"].values

    # 정확도 비교
    y_big = df_big["actualSajung"].values
    candidates = {
        "그룹 mean (LOO)":        df_big["loo_mean"].values,
        "그룹 median":             df_big["loo_median"].values,
        "B-q70 단독":              df_big["B_q70"].values,
        "B-q70-M1 (현재 운영)":    df_big["b_q70_m1"].values,
    }
    print(f"\n큰 그룹 (N>=30) {len(df_big):,}건 정확도:")
    print(f"\n{'통계량':30} {'MAE':>8} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12}")
    print("-" * 80)
    for name, arr in candidates.items():
        dev = np.abs(arr - y_big)
        mae = dev.mean()
        t1 = (dev <= 0.05).mean() * 100
        w05 = (dev <= 0.5).mean() * 100
        w10 = (dev <= 1.0).mean() * 100
        print(f"  {name[:28]:30} {mae:>7.4f} {t1:>11.2f}% {w05:>11.2f}% {w10:>11.2f}%")

    out_path = DATA_DIR / f"org_cat_analysis_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "total": len(df),
            "category_count": len(cat_counts),
            "org_count": len(org_counts),
            "org_cat_group_count": len(grp_counts),
            "big_groups_30plus": int((grp_counts >= 30).sum()),
            "category_stats": cat_stats.to_dict(orient="index"),
        }, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
