"""
Model 2 v5 — KoBERT 텍스트 임베딩 + LGBM (concept drift 대응)

배경:
  v4 oracle hierarchical (train→train 0.3418, train→val 0.3203, train→test 0.3207)
  → categorical 피처 모두 시간 분포 변화에 약함 (concept drift)

가설:
  공고 제목(title)은 시간 무관 의미 정보 포함.
  "도로 포장 공사" "터널 안전점검" 등 의미 패턴은 시계열에 안정적.

구성:
  - v3 동일 피처 (categorical + numeric + smoothed TE)
  - + KoBERT 임베딩 PCA 64d (embed_titles.py 결과 사용)
  - LGBM 동일 하이퍼파라미터 (lr 0.01, num_boost 2000, early_stop 100)
  - global frequency blend (alpha 탐색)

비교:
  v3 baseline: val 0.3260 (oracle/freq 동일)
  v5 목표: val/test 0.32 → 0.33+ (concept drift 회복)
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
EMB_PATH = ROOT / "data" / "title_emb_64.npy"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "opening_lgbm_v5.pkl"

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

EMB_DIM = 64
EMB_COLS = [f"emb_{i}" for i in range(EMB_DIM)]


def add_target_encoding(df_train, df_val, df_test):
    print("\n[v5] smoothed target encoding...")
    encoders = {}
    smoothing = 100.0
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
    if not EMB_PATH.exists():
        print(f"ERROR: {EMB_PATH} 없음 — embed_titles.py 먼저 실행")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    print(f"전체: {len(df):,}건")

    # 임베딩 로드
    print(f"임베딩 로드: {EMB_PATH}")
    emb = np.load(EMB_PATH)
    if emb.shape[0] != len(df):
        print(f"ERROR: 임베딩 행수({emb.shape[0]}) != 데이터({len(df)})")
        sys.exit(1)
    print(f"  shape: {emb.shape}")

    # split 분리
    train_idx = (df["split"] == "train").values
    val_idx   = (df["split"] == "val").values
    test_idx  = (df["split"] == "test").values

    df_train = df.loc[train_idx].copy()
    df_val   = df.loc[val_idx].copy()
    df_test  = df.loc[test_idx].copy()
    emb_train = emb[train_idx]
    emb_val   = emb[val_idx]
    emb_test  = emb[test_idx]
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    # global freq baseline
    global_freqs = df_train[TARGET_COLS].mean().values
    print(f"\nglobal freq baseline:")
    n_val = len(df_val)
    val_baseline = np.tile(global_freqs, (n_val, 1))
    val_y = df_val[TARGET_COLS].values
    print(f"  val Top-4 (freq only): {top_k_precision(val_baseline, val_y, k=4):.4f}")

    # target encoding
    df_train, df_val, df_test, te_encoders = add_target_encoding(df_train, df_val, df_test)

    # categorical
    df_train, df_val, df_test, cat_encoders = encode_categoricals(df_train, df_val, df_test)

    # 임베딩 컬럼은 numpy로 직접 연결 (pandas fragmentation 방지)
    print(f"\n[v5] 임베딩 64d 추가 (numpy concat)...")
    feature_cols_no_emb = CATEGORICAL_COLS + NUMERIC_COLS + TE_COLS
    feature_cols = feature_cols_no_emb + EMB_COLS
    print(f"피처 {len(feature_cols)}개 (no_emb {len(feature_cols_no_emb)} + emb {len(EMB_COLS)})")

    # 기존 피처 numpy 추출 → emb과 concat
    X_train = np.hstack([df_train[feature_cols_no_emb].to_numpy(dtype=np.float32, na_value=0), emb_train])
    X_val   = np.hstack([df_val[feature_cols_no_emb].to_numpy(dtype=np.float32, na_value=0), emb_val])
    X_test  = np.hstack([df_test[feature_cols_no_emb].to_numpy(dtype=np.float32, na_value=0), emb_test])
    print(f"  X_train shape: {X_train.shape}")
    print(f"  X_val shape: {X_val.shape}")
    print(f"  X_test shape: {X_test.shape}")
    # 메모리 절약: 임시 emb 변수 해제
    del emb, emb_train, emb_val, emb_test

    # categorical_feature 인덱스 (CATEGORICAL_COLS는 numpy 배열의 첫 5개 컬럼)
    cat_feature_idx = list(range(len(CATEGORICAL_COLS)))

    params = dict(
        objective="binary",
        metric="binary_logloss",
        num_leaves=63,
        learning_rate=0.02,
        feature_fraction=0.7,       # emb 64d 많아짐 → 더 강한 fraction
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=200,
        is_unbalance=False,
        verbose=-1,
    )

    boosters = []
    print("\n[v5] LGBM 15개 학습 (KoBERT emb 포함):")
    t_start = time.time()
    for i, target in enumerate(TARGET_COLS):
        y_train = df_train[target].astype(int)
        y_val   = df_val[target].astype(int)
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            print(f"  {target}: skip")
            boosters.append(None)
            continue

        pos = y_train.sum()
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
            callbacks=[
                lgb.early_stopping(stopping_rounds=100),
                lgb.log_evaluation(period=0),
            ],
        )
        boosters.append(booster)
        val_pred = booster.predict(X_val, num_iteration=booster.best_iteration)
        auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        elapsed = time.time() - t_start
        print(f"  {target}: best_iter={booster.best_iteration}, AUC={auc:.4f} ({elapsed:.0f}s)")

    print("\n=== 평가 ===")

    def predict_ml(X: np.ndarray) -> np.ndarray:
        preds = np.zeros((len(X), N_NUMBERS))
        for i, booster in enumerate(boosters):
            if booster is None:
                preds[:, i] = global_freqs[i]
                continue
            preds[:, i] = booster.predict(X, num_iteration=booster.best_iteration)
        return preds

    def report(name, X, df_split, alphas=(0.0, 0.3, 0.5, 0.7, 1.0)):
        if X.shape[0] == 0:
            return
        y_true = df_split[TARGET_COLS].values
        ml_preds = predict_ml(X)
        n = len(ml_preds)
        freq_preds = np.tile(global_freqs, (n, 1))

        print(f"\n  {name} (n={n:,}):")
        best_alpha = 0.0
        best_prec = 0.0
        for alpha in alphas:
            blend = alpha * ml_preds + (1 - alpha) * freq_preds
            prec = top_k_precision(blend, y_true, k=4)
            print(f"    alpha={alpha:.1f}: {prec:.4f}")
            if prec > best_prec:
                best_prec = prec
                best_alpha = alpha
        print(f"    → best alpha={best_alpha} → {best_prec:.4f}")

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
        "emb_cols": EMB_COLS,
        "n_numbers": N_NUMBERS,
        "version": "v5-kobert-emb",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
