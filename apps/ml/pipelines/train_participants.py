"""
Model 3 — 참여자수 예측 (CORE 3 사전 예측)

공고 특성 → 최종 참여자 수 회귀

입력: apps/ml/data/participants_data.csv
모델: LightGBM regression (Poisson or gamma)
타겟: numBidders (1~500)

출력: apps/ml/models/participants_lgbm.pkl

실행:
    cd apps/ml
    .venv\\Scripts\\activate
    python pipelines/train_participants.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "participants_data.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "participants_lgbm.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "budget_log", "bsisAmt_log", "lwltRate",
    "month", "season_q", "year", "weekday",
    "days_to_deadline",
    "aValueTotal_log", "has_avalue",
    "org_avg_bidders", "category_avg_bidders",
]
TARGET_COL = "numBidders"


def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """발주처·업종별 과거 평균 참여자 수 피처 생성 (leak 방지: train만으로 계산)"""
    org_map = df[df["split"] == "train"].groupby("orgName")[TARGET_COL].mean().to_dict()
    cat_map = df[df["split"] == "train"].groupby("category")[TARGET_COL].mean().to_dict()
    global_mean = df[df["split"] == "train"][TARGET_COL].mean()
    df["org_avg_bidders"] = df["orgName"].map(org_map).fillna(global_mean)
    df["category_avg_bidders"] = df["category"].map(cat_map).fillna(global_mean)
    return df, {"org_map": org_map, "cat_map": cat_map, "global_mean": float(global_mean)}


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


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음. 먼저 export-participants-data.ts 실행하세요.")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    print(f"전체: {len(df):,}건")

    # 발주처·업종 평균 피처 생성
    df, avg_maps = add_derived_features(df)

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")
    print(f"  타겟 mean: train {df_train[TARGET_COL].mean():.1f} / val {df_val[TARGET_COL].mean():.1f} / test {df_test[TARGET_COL].mean():.1f}")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS

    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].astype(float)
    X_val,   y_val   = df_val[feature_cols],   df_val[TARGET_COL].astype(float)
    X_test,  y_test  = df_test[feature_cols],  df_test[TARGET_COL].astype(float)

    params = dict(
        objective="regression",       # L2 regression (MSE)
        metric=["mae", "rmse"],
        num_leaves=63,
        learning_rate=0.05,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=50,
        verbose=-1,
    )

    train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS, reference=train_set)

    print("\n학습 시작...")
    model = lgb.train(
        params,
        train_set,
        num_boost_round=2000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=100),
            lgb.log_evaluation(period=50),
        ],
    )

    print("\n평가:")
    def report(name, X, y):
        pred = model.predict(X, num_iteration=model.best_iteration)
        pred = np.clip(pred, 1, None)  # 최소 1명
        mae = mean_absolute_error(y, pred)
        rmse = np.sqrt(mean_squared_error(y, pred))
        r2 = r2_score(y, pred)
        print(f"  {name}: MAE={mae:.2f}  RMSE={rmse:.2f}  R²={r2:.4f}")
        return mae, rmse

    _, rmse_train = report("train", X_train, y_train)
    _, rmse_val = report("val",   X_val,   y_val)
    mae_test, rmse_test = report("test",  X_test,  y_test)

    print("\n상위 피처 중요도 (Top 10):")
    imp = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importance(importance_type="gain"),
    }).sort_values("importance", ascending=False)
    for _, row in imp.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.0f}")

    target = 15
    print(f"\n목표 RMSE ≤ {target} vs 실제 test = {rmse_test:.2f}")
    if rmse_test <= target:
        print("[OK] 목표 달성")
    else:
        print("[WARN] 목표 미달")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": model,
        "encoders": encoders,
        "avg_maps": avg_maps,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "model_version": "participants-lgbm-v1.0",
        "metrics": {
            "rmse_train": float(rmse_train),
            "rmse_val": float(rmse_val),
            "rmse_test": float(rmse_test),
            "mae_test": float(mae_test),
        },
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
