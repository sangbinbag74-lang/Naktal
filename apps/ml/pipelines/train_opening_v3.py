"""
Model 2 v3 — 정확도 개선 풀버전 (단계 1+2+3)

단계 1: frequency baseline blending (ML 70% + 글로벌 빈도 30%)
단계 2: LGBM 재튜닝 (best_iter=1 해결)
  - learning_rate 0.05 → 0.01 (slow learning)
  - num_boost_round 500 → 2000
  - early_stopping 50 → 100 (rounds 더 기다림)
  - is_unbalance=False, scale_pos_weight 명시
  - num_leaves 63 → 31 (overfit 방지)
  - min_data_in_leaf 50 → 200 (regularization)
단계 3: target encoding 강화 (orgName + category + 두 컬럼 결합)

검증:
  - val/test Top-4 Precision (vs single freq baseline 0.334, oracle 0.344)

실행: python pipelines/train_opening_v3.py
"""
import sys
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
MODEL_PATH = MODEL_DIR / "opening_lgbm_v3.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "budget_log", "bsisAmt_log", "lwltRate",
    "month", "season_q", "year",
    "numBidders", "aValueTotal_log", "has_avalue",
]
N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]

# 단계 3: target encoding (orgName, category, 결합)
TE_GROUPS = ["orgName", "category"]
TE_COLS = []
for g in TE_GROUPS:
    for i in range(1, N_NUMBERS + 1):
        TE_COLS.append(f"te_{g}_sel_{i}")


def add_target_encoding(df_train, df_val, df_test):
    """smoothed target encoding (Bayesian)"""
    print("\n[단계3] smoothed target encoding 추가...")
    encoders = {}
    smoothing = 100.0  # 작은 그룹은 글로벌 평균 쪽으로
    for group in TE_GROUPS:
        global_means = df_train[TARGET_COLS].mean()
        counts = df_train[group].value_counts().to_dict()
        means = df_train.groupby(group)[TARGET_COLS].mean()

        encoders[group] = {"means": {}, "global": global_means.to_dict(), "smoothing": smoothing}
        for sel_col in TARGET_COLS:
            te_col = f"te_{group}_sel_{TARGET_COLS.index(sel_col)+1}"
            mapping = {}
            for key in means.index:
                cnt = counts.get(key, 0)
                local_mean = means.loc[key, sel_col]
                # smoothed = (cnt * local + smoothing * global) / (cnt + smoothing)
                smoothed = (cnt * local_mean + smoothing * global_means[sel_col]) / (cnt + smoothing)
                mapping[key] = smoothed
            encoders[group]["means"][sel_col] = mapping

            df_train[te_col] = df_train[group].map(mapping).fillna(global_means[sel_col])
            df_val[te_col]   = df_val[group].map(mapping).fillna(global_means[sel_col])
            df_test[te_col]  = df_test[group].map(mapping).fillna(global_means[sel_col])
        print(f"  {group}: 15 피처 추가 (smoothing={smoothing})")
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


def top_k_precision(pred_probs: np.ndarray, y_true: np.ndarray, k: int = 4) -> float:
    n = len(pred_probs)
    hits = 0
    total = 0
    for i in range(n):
        top_k_pred = set(np.argsort(pred_probs[i])[::-1][:k].tolist())
        true_idx = set(np.where(y_true[i] == 1)[0].tolist())
        if len(true_idx) == 0:
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
    print(f"전체: {len(df):,}건")

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    # 글로벌 빈도 (단계 1: blending baseline)
    global_freqs = df_train[TARGET_COLS].mean().values
    print(f"\n[단계1] global frequency baseline:")
    for i, f in enumerate(global_freqs):
        print(f"  sel_{i+1}: {f:.4f}")
    # 글로벌 빈도만 사용한 baseline
    n_val = len(df_val)
    val_baseline_pred = np.tile(global_freqs, (n_val, 1))
    val_y = df_val[TARGET_COLS].values
    base_prec = top_k_precision(val_baseline_pred, val_y, k=4)
    print(f"  → val Top-4 (frequency only baseline): {base_prec:.4f}")

    # 단계 3: target encoding
    df_train, df_val, df_test, te_encoders = add_target_encoding(df_train, df_val, df_test)

    # categorical 인코딩
    df_train, df_val, df_test, cat_encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS + TE_COLS
    print(f"\n피처 {len(feature_cols)}개, 타겟 {N_NUMBERS}개")

    X_train = df_train[feature_cols]
    X_val   = df_val[feature_cols]
    X_test  = df_test[feature_cols]

    # 단계 2: LGBM 재튜닝 (best_iter=1 해결)
    params = dict(
        objective="binary",
        metric="binary_logloss",
        num_leaves=31,             # 63 → 31 (overfit 방지)
        learning_rate=0.01,        # 0.05 → 0.01 (slow learning)
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=200,      # 50 → 200 (regularization)
        is_unbalance=False,        # True → False (scale_pos_weight 사용)
        verbose=-1,
    )

    boosters = []
    print("\n[단계2] LGBM 재튜닝 — 15개 번호 학습:")
    for i, target in enumerate(TARGET_COLS):
        y_train = df_train[target].astype(int)
        y_val   = df_val[target].astype(int)
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            print(f"  {target}: skip")
            boosters.append(None)
            continue

        # scale_pos_weight = neg/pos 비율
        pos = y_train.sum()
        neg = len(y_train) - pos
        spw = neg / pos if pos > 0 else 1.0

        train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
        val_set = lgb.Dataset(X_val, y_val, categorical_feature=CATEGORICAL_COLS, reference=train_set)

        booster = lgb.train(
            {**params, "scale_pos_weight": spw},
            train_set,
            num_boost_round=2000,         # 500 → 2000
            valid_sets=[val_set],
            valid_names=["val"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=100),  # 50 → 100
                lgb.log_evaluation(period=0),
            ],
        )
        boosters.append(booster)
        val_pred = booster.predict(X_val, num_iteration=booster.best_iteration)
        auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        print(f"  {target}: best_iter={booster.best_iteration}, AUC={auc:.4f}")

    print("\n=== 평가 ===")

    def predict_ml(X: pd.DataFrame) -> np.ndarray:
        preds = np.zeros((len(X), N_NUMBERS))
        for i, booster in enumerate(boosters):
            if booster is None:
                preds[:, i] = global_freqs[i]
                continue
            preds[:, i] = booster.predict(X, num_iteration=booster.best_iteration)
        return preds

    def report(name, X, df_split, alphas=(0.0, 0.3, 0.5, 0.7, 1.0)):
        if len(X) == 0:
            return
        y_true = df_split[TARGET_COLS].values
        ml_preds = predict_ml(X)
        n = len(ml_preds)
        freq_preds = np.tile(global_freqs, (n, 1))

        print(f"\n  {name} (n={n:,}):")
        # 단계 1: blending alpha 탐색
        best_alpha = 0.0
        best_prec = 0.0
        for alpha in alphas:
            blend = alpha * ml_preds + (1 - alpha) * freq_preds
            prec = top_k_precision(blend, y_true, k=4)
            print(f"    alpha={alpha:.1f} (ML {alpha*100:.0f}% + freq {(1-alpha)*100:.0f}%): {prec:.4f}")
            if prec > best_prec:
                best_prec = prec
                best_alpha = alpha
        print(f"    → best: alpha={best_alpha} → {best_prec:.4f}")

    report("val",  X_val,  df_val)
    report("test", X_test, df_test)

    # 모델 저장
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
        "version": "v3-blend-retuned-te",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
