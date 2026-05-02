"""
v2 + v3 + tuned + v4(KoBERT) 4-way 앙상블 평가.

같은 v3 test split (100,425건)에 대해:
  - v2 모델 (54 피처, opened_* 제외) predict
  - v3 모델 (60 피처) predict
  - tuned 모델 (60 피처, hyperparam tuned) predict
  - v4 모델 (124 피처, KoBERT 64d 추가) predict
가중 평균 그리드로 best 가중치 탐색.

출력: 최저 val MAE 가중치 + 비교 요약
"""
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v3.csv"
EMB_PATH = ROOT / "data" / "title_emb_sajung_64.npy"
MODEL_DIR = ROOT / "models"
V2_PATH = MODEL_DIR / "sajung_lgbm_v2.pkl"
V3_PATH = MODEL_DIR / "sajung_lgbm_v3.pkl"
TUNED_PATH = MODEL_DIR / "sajung_lgbm_v3_tuned.pkl"
V4_PATH = MODEL_DIR / "sajung_lgbm_v4.pkl"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]


def encode_with(le_dict: dict, df: pd.DataFrame, cols: list) -> pd.DataFrame:
    """기존 학습된 인코더로 transform (unknown은 -1)."""
    df = df.copy()
    for col in cols:
        le = le_dict[col]
        classes = {str(c): i for i, c in enumerate(le.classes_)}
        df[col] = df[col].astype(str).fillna("").map(classes).fillna(-1).astype(int)
    return df


def main():
    print("=== Ensemble v2 + v3 + tuned + v4 평가 ===")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
        "konepsId": "string",
    })

    emb = None
    emb_cols = []
    if EMB_PATH.exists() and V4_PATH.exists():
        emb = np.load(EMB_PATH)
        if emb.shape[0] == len(df):
            emb_cols = [f"emb_{i}" for i in range(emb.shape[1])]
            emb_df = pd.DataFrame(emb, columns=emb_cols, dtype=np.float32, index=df.index)
            df = pd.concat([df, emb_df], axis=1)
            print(f"  emb 로드: {emb.shape}")
        else:
            print(f"  WARN: 임베딩 행수 {emb.shape[0]} != 데이터 {len(df)}, v4 평가 스킵")
            emb = None

    df_test = df[df["split"] == "test"].copy()
    df_val = df[df["split"] == "val"].copy()
    print(f"  val: {len(df_val):,}  test: {len(df_test):,}")
    y_test = df_test["sajung_rate"].astype(float).values
    y_val  = df_val["sajung_rate"].astype(float).values

    # v2 모델 로드 + 예측
    v2 = joblib.load(V2_PATH)
    v2_features = v2["feature_names"]
    v2_enc = v2["encoders"]
    df_test_v2 = encode_with(v2_enc, df_test, CATEGORICAL_COLS)
    df_val_v2  = encode_with(v2_enc, df_val,  CATEGORICAL_COLS)
    pred_v2_test = v2["model"].predict(df_test_v2[v2_features])
    pred_v2_val  = v2["model"].predict(df_val_v2[v2_features])
    mae_v2_test = mean_absolute_error(y_test, pred_v2_test)
    mae_v2_val  = mean_absolute_error(y_val, pred_v2_val)
    print(f"\n[v2]    val MAE={mae_v2_val:.4f}  test MAE={mae_v2_test:.4f}")

    # v3 모델 로드 + 예측
    v3 = joblib.load(V3_PATH)
    v3_features = v3["feature_names"]
    v3_enc = v3["encoders"]
    df_test_v3 = encode_with(v3_enc, df_test, CATEGORICAL_COLS)
    df_val_v3  = encode_with(v3_enc, df_val,  CATEGORICAL_COLS)
    pred_v3_test = v3["model"].predict(df_test_v3[v3_features])
    pred_v3_val  = v3["model"].predict(df_val_v3[v3_features])
    mae_v3_test = mean_absolute_error(y_test, pred_v3_test)
    mae_v3_val  = mean_absolute_error(y_val, pred_v3_val)
    print(f"[v3]    val MAE={mae_v3_val:.4f}  test MAE={mae_v3_test:.4f}")

    # tuned 모델 (있으면)
    pred_tuned_test = None
    pred_tuned_val  = None
    if TUNED_PATH.exists():
        tn = joblib.load(TUNED_PATH)
        tn_features = tn["feature_names"]
        tn_enc = tn["encoders"]
        df_test_tn = encode_with(tn_enc, df_test, CATEGORICAL_COLS)
        df_val_tn  = encode_with(tn_enc, df_val,  CATEGORICAL_COLS)
        pred_tuned_test = tn["model"].predict(df_test_tn[tn_features])
        pred_tuned_val  = tn["model"].predict(df_val_tn[tn_features])
        mae_tn_test = mean_absolute_error(y_test, pred_tuned_test)
        mae_tn_val  = mean_absolute_error(y_val, pred_tuned_val)
        print(f"[tuned] val MAE={mae_tn_val:.4f}  test MAE={mae_tn_test:.4f}")

    # v4 모델 (KoBERT 임베딩, 있으면)
    pred_v4_test = None
    pred_v4_val  = None
    if emb is not None and V4_PATH.exists():
        v4 = joblib.load(V4_PATH)
        v4_features = v4["feature_names"]
        v4_enc = v4["encoders"]
        df_test_v4 = encode_with(v4_enc, df_test, CATEGORICAL_COLS)
        df_val_v4  = encode_with(v4_enc, df_val,  CATEGORICAL_COLS)
        pred_v4_test = v4["model"].predict(df_test_v4[v4_features])
        pred_v4_val  = v4["model"].predict(df_val_v4[v4_features])
        mae_v4_test = mean_absolute_error(y_test, pred_v4_test)
        mae_v4_val  = mean_absolute_error(y_val, pred_v4_val)
        print(f"[v4]    val MAE={mae_v4_val:.4f}  test MAE={mae_v4_test:.4f}")

    # 가중 앙상블 탐색 (val 기준 최저 가중치 채택, test에서 검증)
    print("\n=== 가중 앙상블 (v2 가중치 sweep, val 기준 best 선택) ===")
    candidates = [(round(w, 2), round(1 - w, 2)) for w in np.linspace(0, 1, 21)]
    best_v23 = None
    for w_v2, w_v3 in candidates:
        ens_val  = w_v2 * pred_v2_val  + w_v3 * pred_v3_val
        ens_test = w_v2 * pred_v2_test + w_v3 * pred_v3_test
        mae_val  = mean_absolute_error(y_val, ens_val)
        mae_test = mean_absolute_error(y_test, ens_test)
        if best_v23 is None or mae_val < best_v23["mae_val"]:
            best_v23 = {"w_v2": w_v2, "w_v3": w_v3, "mae_val": mae_val, "mae_test": mae_test}
    print(f"  best v2/v3: w_v2={best_v23['w_v2']}  w_v3={best_v23['w_v3']}  val={best_v23['mae_val']:.4f}  test={best_v23['mae_test']:.4f}")

    if pred_tuned_test is not None:
        print("\n=== 3-way 앙상블 (v2 + v3 + tuned, val 기준 그리드) ===")
        best3 = None
        for w_v2 in np.linspace(0, 1, 11):
            for w_v3 in np.linspace(0, 1 - w_v2, 11):
                w_tn = 1 - w_v2 - w_v3
                if w_tn < -1e-9: continue
                w_tn = max(0.0, w_tn)
                ens_val  = w_v2 * pred_v2_val  + w_v3 * pred_v3_val  + w_tn * pred_tuned_val
                ens_test = w_v2 * pred_v2_test + w_v3 * pred_v3_test + w_tn * pred_tuned_test
                mae_val  = mean_absolute_error(y_val, ens_val)
                mae_test = mean_absolute_error(y_test, ens_test)
                if best3 is None or mae_val < best3["mae_val"]:
                    best3 = {"w_v2": round(float(w_v2),2), "w_v3": round(float(w_v3),2), "w_tn": round(float(w_tn),2),
                             "mae_val": mae_val, "mae_test": mae_test}
        print(f"  best 3-way: w_v2={best3['w_v2']}  w_v3={best3['w_v3']}  w_tn={best3['w_tn']}  val={best3['mae_val']:.4f}  test={best3['mae_test']:.4f}")

    # 4-way 그리드 (v2 + v3 + tuned + v4)
    best4 = None
    if pred_tuned_test is not None and pred_v4_test is not None:
        print("\n=== 4-way 앙상블 (v2 + v3 + tuned + v4, val 기준 그리드) ===")
        steps = np.linspace(0, 1, 11)
        for w_v2 in steps:
            for w_v3 in np.linspace(0, 1 - w_v2, 11):
                rem1 = 1 - w_v2 - w_v3
                if rem1 < -1e-9: continue
                rem1 = max(0.0, rem1)
                for w_tn in np.linspace(0, rem1, 11):
                    w_v4 = rem1 - w_tn
                    if w_v4 < -1e-9: continue
                    w_v4 = max(0.0, w_v4)
                    ens_val  = w_v2*pred_v2_val  + w_v3*pred_v3_val  + w_tn*pred_tuned_val  + w_v4*pred_v4_val
                    ens_test = w_v2*pred_v2_test + w_v3*pred_v3_test + w_tn*pred_tuned_test + w_v4*pred_v4_test
                    mae_val  = mean_absolute_error(y_val, ens_val)
                    mae_test = mean_absolute_error(y_test, ens_test)
                    if best4 is None or mae_val < best4["mae_val"]:
                        best4 = {
                            "w_v2": round(float(w_v2),2),
                            "w_v3": round(float(w_v3),2),
                            "w_tn": round(float(w_tn),2),
                            "w_v4": round(float(w_v4),2),
                            "mae_val": mae_val, "mae_test": mae_test,
                        }
        print(f"  best 4-way: w_v2={best4['w_v2']}  w_v3={best4['w_v3']}  w_tn={best4['w_tn']}  w_v4={best4['w_v4']}  val={best4['mae_val']:.4f}  test={best4['mae_test']:.4f}")

    # 비교 요약
    print("\n=== 요약 ===")
    print(f"  v2 단독       test MAE = {mae_v2_test:.4f}")
    print(f"  v3 단독       test MAE = {mae_v3_test:.4f}")
    if pred_tuned_test is not None:
        print(f"  tuned 단독    test MAE = {mae_tn_test:.4f}")
    if pred_v4_test is not None:
        print(f"  v4 단독       test MAE = {mae_v4_test:.4f}")
    print(f"  v2+v3 best    test MAE = {best_v23['mae_test']:.4f}  ({best_v23['w_v2']}/{best_v23['w_v3']})")
    if pred_tuned_test is not None:
        print(f"  3-way best    test MAE = {best3['mae_test']:.4f}  ({best3['w_v2']}/{best3['w_v3']}/{best3['w_tn']})")
    if best4 is not None:
        print(f"  4-way best    test MAE = {best4['mae_test']:.4f}  ({best4['w_v2']}/{best4['w_v3']}/{best4['w_tn']}/{best4['w_v4']})")


if __name__ == "__main__":
    main()
