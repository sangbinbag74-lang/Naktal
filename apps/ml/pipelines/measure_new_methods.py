"""박상빈님 5/19 — 학습 X 신규 방법 #9/#10/#11 + ensemble 측정.

#9 적응형 가중 (sampleSize 동적): w_stat = min(1, N/100), w_ml = 1-w_stat
#10 BidResult KDE: 카테고리+예산구간별 actualSajung KDE mode
#11 박스권 Monte Carlo: B-q05~q95 안 100 후보 → mode 추천

각 + B-q70-M1 ensemble 변형도 측정.
주의: 145K backtest leakage 회피 — leave-self-out (자기 제외) 적용.
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

    # 박상빈님 sajung-engine 의 budgetRange 매핑 (5억 단위 5 그룹)
    def get_budget_range(b):
        if b < 5e8: return "0_5억"
        if b < 10e8: return "5_10억"
        if b < 30e8: return "10_30억"
        if b < 100e8: return "30_100억"
        return "100억_이상"
    df["budgetRange"] = df["budget"].apply(get_budget_range)

    print(f"[{time.strftime('%H:%M:%S')}] 표본 {len(df):,}건", flush=True)

    # ML 모델 추론 (B-q70-M1 운영중 + 비교용)
    print(f"\n[{time.strftime('%H:%M:%S')}] 6 모델 추론 (B-q70-M1 합성용)…", flush=True)
    preds = {}
    base = [
        ("v2",      "sajung_lgbm_v2.pkl"),
        ("tuned",   "sajung_lgbm_v3_tuned.pkl"),
        ("xgb",     "sajung_xgboost.pkl"),
        ("cat",     "sajung_catboost.pkl"),
        ("q95_old", "sajung_quantile_q95.pkl"),
        ("B_q70",   "sajung_quantile_q70_new.pkl"),
    ]
    for name, fn in base:
        preds[name] = predict_one(MODEL_DIR / fn, df)
        print(f"  {name}: 평균 {preds[name].mean():.3f}%")

    # 박스권용 q05/q95
    print(f"\n[{time.strftime('%H:%M:%S')}] 박스권용 B-q05/q95 추론…", flush=True)
    preds["B_q05"] = predict_one(MODEL_DIR / "sajung_quantile_q05_new.pkl", df)
    preds["B_q95"] = predict_one(MODEL_DIR / "sajung_quantile_q95_new.pkl", df)

    # M1 + B-q70-M1
    m1_w = np.array([0.15, 0.15, 0.10, 0.00, 0.60])
    P5 = np.stack([preds["v2"], preds["tuned"], preds["xgb"], preds["cat"], preds["q95_old"]])
    preds["M1"] = (P5.T @ m1_w)
    preds["B_q70_M1"] = 0.5 * preds["B_q70"] + 0.5 * preds["M1"]
    print(f"  B-q70-M1: 평균 {preds['B_q70_M1'].mean():.3f}%")

    # ============= #9 적응형 가중 (sampleSize 동적, leave-self-out) =============
    print(f"\n[{time.strftime('%H:%M:%S')}] #9 적응형 가중 (sampleSize 동적, leave-self-out)…", flush=True)
    # 발주처+카테고리+예산구간 leave-self-out mean
    grp_key = ["orgName", "category", "budgetRange"]
    g = df.groupby(grp_key)["actualSajung"]
    sum_t = g.transform("sum")
    cnt_t = g.transform("count")
    stat_mean_loo = (sum_t - df["actualSajung"]) / (cnt_t - 1).clip(lower=1)
    stat_size_loo = (cnt_t - 1).clip(lower=0)
    # size=0 인 경우 = ML 100%
    stat_mean_loo = stat_mean_loo.where(stat_size_loo > 0, preds["B_q70_M1"])
    w_stat = (stat_size_loo / 100).clip(upper=1.0).values
    w_ml = 1 - w_stat
    preds["A9_adaptive"] = w_stat * stat_mean_loo.values + w_ml * preds["B_q70_M1"]
    print(f"  #9 평균 w_stat: {w_stat.mean():.3f}, 평균 stat_size: {stat_size_loo.mean():.1f}")

    # ============= #10 BidResult KDE — 카테고리+예산구간별 mode =============
    print(f"\n[{time.strftime('%H:%M:%S')}] #10 BidResult KDE…", flush=True)
    kde_mode = {}
    cat_budget_groups = df.groupby(["category", "budgetRange"])
    for (cat, br), sub in cat_budget_groups:
        if len(sub) < 30:
            kde_mode[(cat, br)] = sub["actualSajung"].median()
            continue
        try:
            kde = gaussian_kde(sub["actualSajung"].values, bw_method=0.1)
            xs = np.linspace(sub["actualSajung"].quantile(0.05), sub["actualSajung"].quantile(0.95), 200)
            mode_x = xs[np.argmax(kde(xs))]
            kde_mode[(cat, br)] = float(mode_x)
        except Exception:
            kde_mode[(cat, br)] = sub["actualSajung"].median()
    # 각 row 의 (category, budgetRange) → mode
    preds["A10_kde"] = np.array([kde_mode.get((cat, br), df["actualSajung"].median())
                                  for cat, br in zip(df["category"], df["budgetRange"])])
    print(f"  #10 KDE mode 평균: {preds['A10_kde'].mean():.3f}%, group 수 {len(kde_mode)}")

    # ============= #11 박스권 + Monte Carlo (박스권 안 mode) =============
    print(f"\n[{time.strftime('%H:%M:%S')}] #11 박스권 Monte Carlo…", flush=True)
    # 각 row 박스권 안에서 카테고리 KDE mode 가 박스권 안인지 확인
    # 박스권 안이면 mode 사용, 박스권 밖이면 박스권 중심 (q40+q60)/2 사용
    box_low = preds["B_q05"]
    box_high = preds["B_q95"]
    in_box = (preds["A10_kde"] >= box_low) & (preds["A10_kde"] <= box_high)
    box_mid = (preds["B_q70"] + 0.5 * (preds["B_q95"] - preds["B_q05"]) * 0)  # 추천 = B-q70 (박스권 중심 근처)
    # 박스권 안 = KDE mode, 박스권 밖 = B-q70 폴백
    preds["A11_box_mc"] = np.where(in_box, preds["A10_kde"], preds["B_q70_M1"])
    print(f"  #11 KDE mode 박스권 안 비율: {in_box.mean()*100:.2f}%")

    # ============= Ensemble 변형 =============
    print(f"\n[{time.strftime('%H:%M:%S')}] Ensemble 변형 합성…", flush=True)
    preds["A9_M1_5050"]  = 0.5 * preds["A9_adaptive"] + 0.5 * preds["B_q70_M1"]
    preds["A10_M1_5050"] = 0.5 * preds["A10_kde"]    + 0.5 * preds["B_q70_M1"]
    preds["A11_M1_5050"] = 0.5 * preds["A11_box_mc"] + 0.5 * preds["B_q70_M1"]
    # 3way: 적응형 + KDE + Monte Carlo
    preds["A9_10_11_avg"] = (preds["A9_adaptive"] + preds["A10_kde"] + preds["A11_box_mc"]) / 3
    # 4way: + B-q70-M1
    preds["A_all_with_M1"] = (preds["A9_adaptive"] + preds["A10_kde"] + preds["A11_box_mc"] + preds["B_q70_M1"]) / 4

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
    print(f"📊 학습 X 신규 방법 #9/#10/#11 + ensemble 측정")
    print(f"{'='*110}")
    print(f"\n{'변형':50} {'부적격율':>10} {'1위±0.05%p':>12} {'진입±0.5%p':>12} {'진입±1.0%p':>12} {'점수':>10}")
    print("-" * 110)

    methods = [
        ("== 기준 ==", None),
        ("B-q70-M1 (현재 운영중)",                    "B_q70_M1"),
        ("B-q70 단독",                                "B_q70"),
        ("", None),
        ("== 단독 ==", None),
        ("#9 적응형 (stat × sampleSize/100)",         "A9_adaptive"),
        ("#10 BidResult KDE mode (cat+budgetRange)",   "A10_kde"),
        ("#11 박스권 KDE Monte Carlo",                  "A11_box_mc"),
        ("", None),
        ("== ensemble + B-q70-M1 (50:50) ==", None),
        ("#9 + B-q70-M1 (50:50)",                     "A9_M1_5050"),
        ("#10 + B-q70-M1 (50:50)",                    "A10_M1_5050"),
        ("#11 + B-q70-M1 (50:50)",                    "A11_M1_5050"),
        ("", None),
        ("== 3way / 4way ==", None),
        ("#9 + #10 + #11 평균 (1/3 each)",            "A9_10_11_avg"),
        ("#9 + #10 + #11 + B-q70-M1 평균 (1/4 each)", "A_all_with_M1"),
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

    print(f"\n{'='*110}")
    print(f"🏆 박상빈님 ultimate_goal 점수 순위 (top1±0.05 - disq*0.05)")
    print(f"{'='*110}")
    scored = sorted(results, key=lambda r: -r["score"])
    for i, r in enumerate(scored):
        print(f"  {i+1:>2}  {r['label'][:48]:50} 부적격 {r['disq']:>7.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:>6.3f}")

    out_path = DATA_DIR / f"new_methods_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"total": len(df), "results": scored}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_path}", flush=True)


if __name__ == "__main__":
    main()
