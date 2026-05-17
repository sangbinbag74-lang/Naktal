"""
CatBoost 재학습 — cat_features 없이 (label encoded numerical) → ONNX 변환 가능
박상빈님 5/17 명시 v2/xgb/cat 3개 가중치 운영 답
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error

from catboost import CatBoostRegressor

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v2.csv"
MODEL_DIR = ROOT / "models"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "month", "year", "weekday", "is_quarter_end", "is_year_end", "season_q",
    "budget_log", "numBidders",
    "stat_avg", "stat_stddev", "stat_p25", "stat_p75", "sampleSize",
    "bidder_volatility", "is_sparse_org",
    "aValueTotal_log", "aValue_ratio", "has_avalue",
    "bsisAmt_log", "bsis_to_budget",
    "lwltRate", "rsrvtn_bgn", "rsrvtn_end",
    "has_prestdrd", "chg_count",
    "org_past_mean", "org_past_std", "org_past_cnt",
    "cat_past_mean", "cat_past_std", "cat_past_cnt",
    "reg_past_mean", "reg_past_std", "reg_past_cnt",
    "bud_past_mean", "bud_past_std", "bud_past_cnt",
    "sub_past_mean", "sub_past_std", "sub_past_cnt",
    "orgcat_past_mean", "orgcat_past_std", "orgcat_past_cnt",
    "catreg_past_mean", "catreg_past_std", "catreg_past_cnt",
    "orgbud_past_mean", "orgbud_past_std", "orgbud_past_cnt",
]


def main():
    df = pd.read_csv(DATA_PATH, dtype={c: "string" for c in CATEGORICAL_COLS + ["split"]}, low_memory=False)
    df_train = df[df["split"] == "train"].copy()
    df_val = df[df["split"] == "val"].copy()
    df_test = df[df["split"] == "test"].copy()

    # Label encoding (cat 컬럼을 numerical 로 변환 = ONNX 변환 가능)
    encoders = {}
    for c in CATEGORICAL_COLS:
        le = LabelEncoder()
        all_v = pd.concat([df_train[c], df_val[c], df_test[c]]).astype(str).fillna("UNK")
        le.fit(all_v)
        df_train[c] = le.transform(df_train[c].astype(str).fillna("UNK"))
        df_val[c] = le.transform(df_val[c].astype(str).fillna("UNK"))
        df_test[c] = le.transform(df_test[c].astype(str).fillna("UNK"))
        encoders[c] = le

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    X_train, y_train = df_train[feature_cols].astype(float), df_train["sajung_rate"].astype(float)
    X_val, y_val = df_val[feature_cols].astype(float), df_val["sajung_rate"].astype(float)
    X_test, y_test = df_test[feature_cols].astype(float), df_test["sajung_rate"].astype(float)
    print(f"train: {len(X_train):,}, val: {len(X_val):,}, test: {len(X_test):,}")

    # cat_features 없이 학습 (모두 numerical, label encoded)
    model = CatBoostRegressor(
        iterations=3000, learning_rate=0.03, depth=8,
        loss_function="MAE", eval_metric="MAE",
        early_stopping_rounds=150,
        verbose=200,
        # cat_features=[] — 명시 X = 모두 numerical
    )
    model.fit(X_train, y_train, eval_set=(X_val, y_val))

    mae_test = mean_absolute_error(y_test, model.predict(X_test))
    print(f"\ntest MAE: {mae_test:.4f}")

    # ONNX 변환 가능 검증
    out_onnx = ROOT.parent / "web" / "ml" / "sajung_catboost.onnx"
    out_onnx.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(out_onnx), format="onnx",
                     export_parameters={"onnx_domain": "ai.catboost",
                                        "onnx_graph_name": "sajung_catboost"})
    print(f"ONNX: {out_onnx} ({out_onnx.stat().st_size / 1024 / 1024:.2f} MB)")

    # pkl 저장
    out_pkl = MODEL_DIR / "sajung_catboost_onnx_compat.pkl"
    joblib.dump({
        "model": model, "feature_names": feature_cols,
        "encoders": encoders, "categorical_cols": CATEGORICAL_COLS,
        "model_version": "sajung-catboost-onnx-compat",
        "metrics": {"mae_test": mae_test},
    }, out_pkl)
    print(f"PKL: {out_pkl}")

    import json
    enc_out = {k: list(le.classes_) for k, le in encoders.items()}
    with open(out_onnx.parent / "sajung_catboost_meta.json", "w", encoding="utf-8") as f:
        json.dump({"feature_names": feature_cols, "encoders": enc_out}, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
