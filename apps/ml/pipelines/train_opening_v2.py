"""
Model 2 v2 — 복수예가 번호 선택 예측 (정확도 개선)

추가:
- target encoding: orgName + category 별 sel_N 과거 평균 (30개 피처 추가)
- (이후 단계에서 CatBoost·KNN·Optuna·KoBERT·앙상블·회귀 추가 예정)

기존 v1 대비 변경:
- target_encoded 컬럼 30개 추가 (org_sel_1~15, cat_sel_1~15)
- train 데이터로만 fit, val/test는 매핑만

실행: python pipelines/train_opening_v2.py
"""
import sys
import json
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
MODEL_PATH = MODEL_DIR / "opening_lgbm_v2.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "budget_log", "bsisAmt_log", "lwltRate",
    "month", "season_q", "year",
    "numBidders", "aValueTotal_log", "has_avalue",
]
N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]

# target encoding 추가 컬럼
TE_GROUPS = ["orgName", "category"]
TE_COLS = []
for g in TE_GROUPS:
    for i in range(1, N_NUMBERS + 1):
        TE_COLS.append(f"te_{g}_sel_{i}")


def add_target_encoding(df_train, df_val, df_test):
    """orgName, category 별로 sel_N 평균 빈도 계산 (train에서만 fit)"""
    print("\ntarget encoding 추가 중...")
    encoders = {}
    for group in TE_GROUPS:
        global_means = df_train[TARGET_COLS].mean().to_dict()
        means = df_train.groupby(group)[TARGET_COLS].mean()
        means_dict = {col: means[col].to_dict() for col in TARGET_COLS}
        encoders[group] = {"means": means_dict, "global": global_means}

        for i, sel_col in enumerate(TARGET_COLS):
            te_col = f"te_{group}_sel_{i+1}"
            mapping = means_dict[sel_col]
            global_mean = global_means[sel_col]
            df_train[te_col] = df_train[group].map(mapping).fillna(global_mean)
            df_val[te_col]   = df_val[group].map(mapping).fillna(global_mean)
            df_test[te_col]  = df_test[group].map(mapping).fillna(global_mean)
        print(f"  {group}: 30 피처 추가 완료")
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

    # 1단계: target encoding 추가 (categorical encoding 전에)
    df_train, df_val, df_test, te_encoders = add_target_encoding(df_train, df_val, df_test)

    # 2단계: categorical 라벨 인코딩
    df_train, df_val, df_test, cat_encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS + TE_COLS
    print(f"\n피처 {len(feature_cols)}개 (categorical {len(CATEGORICAL_COLS)} + numeric {len(NUMERIC_COLS)} + TE {len(TE_COLS)}), 타겟 {N_NUMBERS}개")

    X_train = df_train[feature_cols]
    X_val   = df_val[feature_cols]
    X_test  = df_test[feature_cols]

    params = dict(
        objective="binary",
        metric="binary_logloss",
        num_leaves=63,
        learning_rate=0.05,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=50,
        is_unbalance=True,
        verbose=-1,
    )

    boosters = []
    print("\n15개 번호 각각 학습 시작...")
    for i, target in enumerate(TARGET_COLS):
        y_train = df_train[target].astype(int)
        y_val   = df_val[target].astype(int)
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            print(f"  {target}: skip")
            boosters.append(None)
            continue

        train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
        val_set   = lgb.Dataset(X_val, y_val, categorical_feature=CATEGORICAL_COLS, reference=train_set)

        booster = lgb.train(
            params, train_set, num_boost_round=500,
            valid_sets=[val_set], valid_names=["val"],
            callbacks=[lgb.early_stopping(stopping_rounds=50), lgb.log_evaluation(period=0)],
        )
        boosters.append(booster)
        val_pred = booster.predict(X_val, num_iteration=booster.best_iteration)
        auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        print(f"  {target}: best_iter={booster.best_iteration}, val AUC={auc:.4f}")

    print("\n전체 평가 (Top-4 Precision):")

    def predict_all(X: pd.DataFrame) -> np.ndarray:
        preds = np.zeros((len(X), N_NUMBERS))
        for i, booster in enumerate(boosters):
            if booster is None:
                preds[:, i] = 4.0 / 15.0
                continue
            preds[:, i] = booster.predict(X, num_iteration=booster.best_iteration)
        return preds

    def report(name, X, df_split):
        if len(X) == 0:
            return
        y_true = df_split[TARGET_COLS].values
        preds = predict_all(X)
        prec = top_k_precision(preds, y_true, k=4)
        print(f"  {name}: Top-4 Precision = {prec:.4f} (baseline 0.2667)")

    report("train", X_train, df_train)
    report("val",   X_val,   df_val)
    report("test",  X_test,  df_test)

    # 모델 + 인코더 저장
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "boosters": boosters,
        "cat_encoders": cat_encoders,
        "te_encoders": te_encoders,
        "feature_cols": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "te_cols": TE_COLS,
        "n_numbers": N_NUMBERS,
        "version": "v2-target-encoding",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
