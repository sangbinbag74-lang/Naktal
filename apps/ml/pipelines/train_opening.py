"""
Model 2 — 복수예가 번호 선택 예측 (CORE 2 ML)

BidOpeningDetail.selPrdprcIdx 학습 → 15개 예비가 각각의 선택 확률 예측

입력: apps/ml/data/opening_data.csv (각 행 = 1개 공고, sel_1~sel_15 바이너리)
모델: LightGBM MultiOutputClassifier (15개 이진 분류기)
타겟: 각 번호 1~15 선택 여부 (4개가 1, 11개가 0)

출력: apps/ml/models/opening_lgbm.pkl
  - 15개 LightGBM Booster
  - LabelEncoders
  - feature_names, model_version

평가: Top-4 Precision (상위 4개 예측 번호가 실제 선택된 4개와 얼마나 겹치는지)

실행:
    cd apps/ml
    .venv\\Scripts\\activate
    python pipelines/train_opening.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import log_loss, roc_auc_score
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "opening_lgbm.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "budget_log", "bsisAmt_log", "lwltRate",
    "month", "season_q", "year",
    "numBidders", "aValueTotal_log", "has_avalue",
]
N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]


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
    """각 공고별 상위 k개 예측 번호가 실제 선택된 k개 중 얼마나 맞는지"""
    n = len(pred_probs)
    hits = 0
    total = 0
    for i in range(n):
        top_k_pred = set(np.argsort(pred_probs[i])[::-1][:k].tolist())
        true_idx = set(np.where(y_true[i] == 1)[0].tolist())
        if len(true_idx) == 0:
            continue
        hits += len(top_k_pred & true_idx)
        total += k  # 분모는 예측한 k개
    return hits / total if total > 0 else 0.0


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음. 먼저 export-opening-data.ts 실행하세요.")
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

    if len(df_train) < 50000:
        print(f"WARN: train {len(df_train):,}건 (권장 50,000+)")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    print(f"\n피처 {len(feature_cols)}개, 타겟 {N_NUMBERS}개 (sel_1~sel_15)")

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
        is_unbalance=True,   # 15개 중 4개만 1 (positive 27%)
        verbose=-1,
    )

    # 15개 바이너리 classifier 각각 학습
    boosters = []
    print("\n15개 번호 각각 학습 시작...")
    for i, target in enumerate(TARGET_COLS):
        y_train = df_train[target].astype(int)
        y_val   = df_val[target].astype(int)
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            print(f"  {target}: skip (unbalanced)")
            boosters.append(None)
            continue

        train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
        val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS, reference=train_set)

        booster = lgb.train(
            params,
            train_set,
            num_boost_round=500,
            valid_sets=[val_set],
            valid_names=["val"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=50),
                lgb.log_evaluation(period=0),  # 조용히
            ],
        )
        boosters.append(booster)
        val_pred = booster.predict(X_val, num_iteration=booster.best_iteration)
        auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        print(f"  {target}: best_iter={booster.best_iteration}, val AUC={auc:.4f}")

    # 전체 평가
    print("\n전체 평가 (Top-4 Precision):")

    def predict_all(X: pd.DataFrame) -> np.ndarray:
        """n_samples × 15 확률 행렬"""
        preds = np.zeros((len(X), N_NUMBERS))
        for i, booster in enumerate(boosters):
            if booster is None:
                preds[:, i] = 4.0 / 15.0
                continue
            preds[:, i] = booster.predict(X, num_iteration=booster.best_iteration)
        return preds

    def report(name, X, df_split):
        probs = predict_all(X)
        y_true = df_split[TARGET_COLS].values
        p4 = top_k_precision(probs, y_true, k=4)
        random_baseline = 4.0 / 15.0
        print(f"  {name}: Top-4 Precision = {p4:.4f} (baseline {random_baseline:.4f}, lift x{p4/random_baseline:.2f})")
        return p4

    p4_train = report("train", X_train, df_train)
    p4_val   = report("val",   X_val,   df_val)
    p4_test  = report("test",  X_test,  df_test)

    target = 0.30
    print(f"\n목표 Top-4 Precision ≥ {target} vs 실제 test = {p4_test:.4f}")
    if p4_test >= target:
        print("✅ 목표 달성")
    else:
        print("⚠️ 목표 미달 — 더 많은 피처 or 모델 튜닝 필요")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "boosters": boosters,
        "encoders": encoders,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "n_numbers": N_NUMBERS,
        "model_version": "opening-lgbm-v1.0",
        "metrics": {
            "top4_train": float(p4_train),
            "top4_val": float(p4_val),
            "top4_test": float(p4_test),
        },
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
