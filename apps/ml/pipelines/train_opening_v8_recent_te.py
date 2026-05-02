"""
Model 2 v8 — recent-only target encoding (concept drift 직접 대응)

배경:
  data quality 진단:
    - val/test (org,cat) self-oracle = 0.349/0.348 (이론 천장)
    - 그러나 train 전체 (org,cat) freq → val 적용 시 정보 손실 (v4=0.32)
    - 글로벌 freq (sel_1~4 균일) val 적용 = 0.326

가설:
  train 2002-2023 평균은 옛 패턴(0.34) 잔재로 val(2024) 분포와 어긋남.
  최근 2 년 (2022-2023) 만 사용한 TE가 val/test에 더 잘 맞을 것.

방법:
  - TE smoothing 100, recent_train = 2022-2023
  - 그 외는 v3와 동일 (LGBM)
  - 단순화: emb 64d 제외 (v5에서 효과 없음 확인)

비교:
  - v3 (전 train TE): 0.3261 / 0.3260
  - v8 (recent TE): 천장 = val (org,cat) self-oracle 0.349 가능?
"""
import sys
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import LabelEncoder

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "opening_lgbm_v8.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "budget_log", "bsisAmt_log", "lwltRate",
    "month", "season_q", "year",
    "numBidders", "aValueTotal_log", "has_avalue",
]
N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]

TE_GROUPS = ["orgName", "category"]
TE_COLS = []
for g in TE_GROUPS:
    for i in range(1, N_NUMBERS + 1):
        TE_COLS.append(f"te_{g}_sel_{i}")

RECENT_YEARS = [2022, 2023]  # train 중 최근 2년
SMOOTHING = 50.0


def add_recent_target_encoding(df_train, df_val, df_test):
    print(f"\n[v8] recent-only TE (years={RECENT_YEARS}, smoothing={SMOOTHING})...")
    recent = df_train[df_train["year"].isin(RECENT_YEARS)].copy()
    print(f"  recent train rows: {len(recent):,}")

    encoders = {}
    for group in TE_GROUPS:
        global_means = recent[TARGET_COLS].mean()
        counts = recent[group].value_counts().to_dict()
        means = recent.groupby(group)[TARGET_COLS].mean()

        encoders[group] = {"means": {}, "global": global_means.to_dict(), "smoothing": SMOOTHING}
        for sel_col in TARGET_COLS:
            te_col = f"te_{group}_sel_{TARGET_COLS.index(sel_col)+1}"
            mapping = {}
            for key in means.index:
                cnt = counts.get(key, 0)
                local_mean = means.loc[key, sel_col]
                smoothed = (cnt * local_mean + SMOOTHING * global_means[sel_col]) / (cnt + SMOOTHING)
                mapping[key] = smoothed
            encoders[group]["means"][sel_col] = mapping

            df_train[te_col] = df_train[group].map(mapping).fillna(global_means[sel_col])
            df_val[te_col]   = df_val[group].map(mapping).fillna(global_means[sel_col])
            df_test[te_col]  = df_test[group].map(mapping).fillna(global_means[sel_col])
        print(f"  {group}: 15 피처")
    return df_train, df_val, df_test, encoders


def encode_categoricals(df_train, df_val, df_test):
    encoders = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        all_values = pd.concat([df_train[col], df_val[col], df_test[col]]).astype(str).fillna("")
        le.fit(all_values)
        df_train[col] = le.transform(df_train[col].astype(str).fillna(""))
        df_val[col]   = le.transform(df_val[col].astype(str).fillna(""))
        df_test[col]  = le.transform(df_test[col].astype(str).fillna(""))
        encoders[col] = le
    return df_train, df_val, df_test, encoders


def top_k_precision(pred_probs, y_true, k=4):
    n = len(pred_probs)
    hits = 0
    total = 0
    for i in range(n):
        top_k_pred = set(np.argsort(pred_probs[i])[::-1][:k].tolist())
        true_idx = set(np.where(y_true[i] == 1)[0].tolist())
        if not true_idx:
            continue
        hits += len(top_k_pred & true_idx)
        total += k
    return hits / total if total > 0 else 0.0


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0).astype(int)
    print(f"전체: {len(df):,}건")

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    # global freq baseline (recent로)
    recent_train = df_train[df_train["year"].isin(RECENT_YEARS)]
    global_freqs = recent_train[TARGET_COLS].mean().values
    print(f"  recent global_freqs top4: {np.argsort(global_freqs)[::-1][:4].tolist()}")

    n_val = len(df_val)
    val_baseline = np.tile(global_freqs, (n_val, 1))
    val_y = df_val[TARGET_COLS].values
    print(f"\n  recent freq -> val Top-4: {top_k_precision(val_baseline, val_y, k=4):.4f}")
    print(f"  recent freq -> test Top-4: {top_k_precision(np.tile(global_freqs, (len(df_test),1)), df_test[TARGET_COLS].values, k=4):.4f}")

    df_train, df_val, df_test, te_encoders = add_recent_target_encoding(df_train, df_val, df_test)
    df_train, df_val, df_test, cat_encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS + TE_COLS
    print(f"피처 {len(feature_cols)}개")

    X_train = df_train[feature_cols].to_numpy(dtype=np.float32, na_value=0)
    X_val   = df_val[feature_cols].to_numpy(dtype=np.float32, na_value=0)
    X_test  = df_test[feature_cols].to_numpy(dtype=np.float32, na_value=0)
    cat_feature_idx = list(range(len(CATEGORICAL_COLS)))

    params = dict(
        objective="binary",
        metric="binary_logloss",
        num_leaves=31,
        learning_rate=0.02,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=200,
        is_unbalance=False,
        verbose=-1,
    )

    boosters = []
    print("\n[v8] LGBM 15개 (recent TE):")
    t_start = time.time()
    for i, target in enumerate(TARGET_COLS):
        y_train = df_train[target].astype(int)
        y_val   = df_val[target].astype(int)
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            print(f"  {target}: skip")
            boosters.append(None)
            continue
        pos = int(y_train.sum())
        neg = len(y_train) - pos
        spw = neg / pos if pos > 0 else 1.0

        train_set = lgb.Dataset(X_train, y_train, categorical_feature=cat_feature_idx)
        val_set = lgb.Dataset(X_val, y_val, categorical_feature=cat_feature_idx, reference=train_set)
        booster = lgb.train(
            {**params, "scale_pos_weight": spw},
            train_set,
            num_boost_round=2000,
            valid_sets=[val_set],
            valid_names=["val"],
            callbacks=[lgb.early_stopping(stopping_rounds=100), lgb.log_evaluation(period=0)],
        )
        boosters.append(booster)
        val_pred = booster.predict(X_val, num_iteration=booster.best_iteration)
        try:
            auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        except Exception:
            auc = 0.5
        elapsed = time.time() - t_start
        print(f"  {target}: best_iter={booster.best_iteration}, AUC={auc:.4f} ({elapsed:.0f}s)")

    print("\n=== 평가 ===")

    def predict_ml(X):
        preds = np.zeros((len(X), N_NUMBERS))
        for i, b in enumerate(boosters):
            if b is None:
                preds[:, i] = global_freqs[i]
                continue
            preds[:, i] = b.predict(X, num_iteration=b.best_iteration)
        return preds

    def report(name, X, df_split):
        if X.shape[0] == 0:
            return
        y_true = df_split[TARGET_COLS].values
        ml_preds = predict_ml(X)
        n = len(ml_preds)
        freq_preds = np.tile(global_freqs, (n, 1))
        print(f"\n  {name} (n={n:,}):")
        for alpha in (0.0, 0.3, 0.5, 0.7, 1.0):
            blend = alpha * ml_preds + (1 - alpha) * freq_preds
            prec = top_k_precision(blend, y_true, k=4)
            print(f"    alpha={alpha:.1f}: {prec:.4f}")

    report("val",  X_val,  df_val)
    report("test", X_test, df_test)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "boosters": boosters,
        "cat_encoders": cat_encoders,
        "te_encoders": te_encoders,
        "global_freqs": global_freqs,
        "feature_cols": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "te_cols": TE_COLS,
        "n_numbers": N_NUMBERS,
        "version": "v8-recent-te",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
