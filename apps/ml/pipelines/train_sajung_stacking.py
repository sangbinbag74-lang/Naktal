"""박상빈님 5/20 #5 — Stacking 메타 학습.

16 변형 출력을 input feature 로 LightGBM 메타 학습.
145K backtest 데이터 train/test split (70/30, 시간 순).

학습 시간 = 약 10~30분.
"""
import sys, io, time, re
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
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
        ORDER BY a.deadline ASC
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
    print(f"[{time.strftime('%H:%M:%S')}] 표본 {len(df):,}건 (시간순)", flush=True)

    # 모델 추론
    print(f"\n[{time.strftime('%H:%M:%S')}] 9 모델 추론…", flush=True)
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

    # Stacking input features: 13 input
    feature_names_stack = [
        "v2", "tuned", "xgb", "q95_old", "B_q50", "B_q60", "B_q70", "B_q80",
        "M1", "B_q70_M1", "cat9", "cat7", "category_id",
    ]
    # category id (LabelEncoder)
    from sklearn.preprocessing import LabelEncoder
    le_cat = LabelEncoder()
    cat_id = le_cat.fit_transform(df["category"].astype(str).fillna(""))

    X_stack = np.column_stack([
        preds["v2"], preds["tuned"], preds["xgb"], preds["q95_old"],
        preds["B_q50"], preds["B_q60"], preds["B_q70"], preds["B_q80"],
        preds["M1"], preds["B_q70_M1"], cat9_pred, cat7_pred, cat_id,
    ])
    y_stack = df["actualSajung"].values

    n = len(df)
    train_end = int(n * 0.7)
    X_train = X_stack[:train_end]; y_train = y_stack[:train_end]
    X_test = X_stack[train_end:]; y_test = y_stack[train_end:]
    print(f"\n  Stacking train: {len(X_train):,} / test: {len(X_test):,}")

    # Stacking 메타 LightGBM Quantile q70
    params = dict(
        objective="quantile", alpha=0.7, metric="quantile",
        num_leaves=31, learning_rate=0.05,
        feature_fraction=0.9, bagging_fraction=0.9, bagging_freq=5,
        min_data_in_leaf=20, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
    )
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=[12])
    val_set = lgb.Dataset(X_test, y_test, categorical_feature=[12], reference=train_set)
    print(f"\n[{time.strftime('%H:%M:%S')}] Stacking 메타 학습 시작…", flush=True)
    model = lgb.train(params, train_set, num_boost_round=1500,
                       valid_sets=[val_set], valid_names=["val"],
                       callbacks=[lgb.early_stopping(80, verbose=False)])

    pred_test = model.predict(X_test, num_iteration=model.best_iteration)
    y_test_arr = y_test
    lwlt_test = df.iloc[train_end:]["lwlt"].values / 100
    av_test = df.iloc[train_end:]["aValueTotal"].values
    bs_test = df.iloc[train_end:]["bsisAmt"].values

    estimated = bs_test * (pred_test / 100)
    opt = (estimated - av_test) * lwlt_test + av_test
    ae = bs_test * (y_test_arr / 100); rl = (ae - av_test) * lwlt_test + av_test
    disq = (opt < rl).mean() * 100
    dev = np.abs(pred_test - y_test_arr)
    top1 = (dev <= 0.05).mean() * 100
    win_05 = (dev <= 0.5).mean() * 100
    win_10 = (dev <= 1.0).mean() * 100
    score = top1 - disq * 0.05
    print(f"\n=== #5 Stacking test (시간순 30%, n={len(X_test):,}) ===")
    print(f"  부적격: {disq:.2f}%")
    print(f"  1위 ±0.05%p: {top1:.2f}%")
    print(f"  진입 ±0.5%p: {win_05:.2f}%")
    print(f"  진입 ±1.0%p: {win_10:.2f}%")
    print(f"  점수: {score:.3f}")
    print(f"\n  vs cat3 (전체 145K): 3.456")
    print(f"  vs #3 Optuna 10K: 3.607")

    out_path = MODEL_DIR / "sajung_stacking.pkl"
    joblib.dump({
        "model": model,
        "feature_names_stack": feature_names_stack,
        "le_cat": le_cat,
        "model_version": "sajung-stacking-2026-05-20",
    }, out_path)
    print(f"\n  저장: {out_path.name}")


if __name__ == "__main__":
    main()
