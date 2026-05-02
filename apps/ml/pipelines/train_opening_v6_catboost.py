"""
Model 2 v6 — CatBoost (LGBM 대체 알고리즘 비교)

배경:
  v3/v5 (LGBM) 모두 best_iter=1, val/test 0.326 — freq baseline 천장
  CatBoost는 categorical encoding 자체가 다르고 ordered boosting로
  target leakage 방어 강함. concept drift 환경에서 LGBM 대비 유리할 가능성.

피처:
  - v5와 동일 (categorical + numeric + smoothed TE + KoBERT 64d)
  - CatBoost native categorical 처리 (label encoding 제거)

비교:
  - v3 LGBM val 0.3261 / test 0.3260
  - v5 LGBM + KoBERT val 0.3261 / test 0.3260
  - v6 CatBoost 목표: 천장 돌파 가능성 진단
"""
import sys
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"
EMB_PATH = ROOT / "data" / "title_emb_64.npy"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "opening_catboost_v6.pkl"

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
    print("\n[v6] smoothed target encoding...")
    smoothing = 100.0
    encoders = {}
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
        print(f"  {group}: 15 피처")
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
    from catboost import CatBoostClassifier, Pool

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

    print(f"임베딩 로드: {EMB_PATH}")
    emb = np.load(EMB_PATH)
    if emb.shape[0] != len(df):
        print(f"ERROR: 임베딩 행수({emb.shape[0]}) != 데이터({len(df)})")
        sys.exit(1)
    print(f"  shape: {emb.shape}")

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

    global_freqs = df_train[TARGET_COLS].mean().values

    df_train, df_val, df_test, te_encoders = add_target_encoding(df_train, df_val, df_test)

    # CatBoost native categorical: 문자열 그대로 + cat_features 인덱스
    print(f"\n[v6] CatBoost native categorical (Label Encoding 없음)")
    for col in CATEGORICAL_COLS:
        df_train[col] = df_train[col].astype(str).fillna("")
        df_val[col]   = df_val[col].astype(str).fillna("")
        df_test[col]  = df_test[col].astype(str).fillna("")

    # numeric/TE/emb 합치기
    feature_cols_no_emb = CATEGORICAL_COLS + NUMERIC_COLS + TE_COLS
    feature_cols = feature_cols_no_emb + EMB_COLS
    print(f"피처 {len(feature_cols)}개")

    # CatBoost는 DataFrame을 직접 먹음, emb 64d만 col로 추가
    print("[v6] emb 컬럼 추가 (DataFrame로)...")
    emb_train_df = pd.DataFrame(emb_train, columns=EMB_COLS, index=df_train.index, dtype=np.float32)
    emb_val_df   = pd.DataFrame(emb_val,   columns=EMB_COLS, index=df_val.index,   dtype=np.float32)
    emb_test_df  = pd.DataFrame(emb_test,  columns=EMB_COLS, index=df_test.index,  dtype=np.float32)
    X_train = pd.concat([df_train[feature_cols_no_emb], emb_train_df], axis=1)
    X_val   = pd.concat([df_val[feature_cols_no_emb],   emb_val_df],   axis=1)
    X_test  = pd.concat([df_test[feature_cols_no_emb],  emb_test_df],  axis=1)
    del emb, emb_train, emb_val, emb_test, emb_train_df, emb_val_df, emb_test_df

    cat_feature_idx = list(range(len(CATEGORICAL_COLS)))

    boosters = []
    print("\n[v6] CatBoost 15개 학습:")
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

        train_pool = Pool(X_train, y_train.values, cat_features=cat_feature_idx)
        val_pool   = Pool(X_val,   y_val.values,   cat_features=cat_feature_idx)

        model = CatBoostClassifier(
            iterations=1000,
            learning_rate=0.03,
            depth=6,
            l2_leaf_reg=5,
            scale_pos_weight=spw,
            loss_function="Logloss",
            eval_metric="Logloss",
            random_seed=42,
            early_stopping_rounds=50,
            verbose=False,
            task_type="CPU",
            thread_count=-1,
        )
        model.fit(train_pool, eval_set=val_pool, use_best_model=True)
        boosters.append(model)

        val_pred = model.predict_proba(X_val)[:, 1]
        try:
            auc = roc_auc_score(y_val, val_pred) if y_val.sum() > 0 and y_val.sum() < len(y_val) else 0.5
        except Exception:
            auc = 0.5
        elapsed = time.time() - t_start
        print(f"  {target}: best_iter={model.tree_count_}, AUC={auc:.4f} ({elapsed:.0f}s)")

    print("\n=== 평가 ===")

    def predict_ml(X) -> np.ndarray:
        preds = np.zeros((len(X), N_NUMBERS))
        for i, model in enumerate(boosters):
            if model is None:
                preds[:, i] = global_freqs[i]
                continue
            preds[:, i] = model.predict_proba(X)[:, 1]
        return preds

    def report(name, X, df_split, alphas=(0.0, 0.3, 0.5, 0.7, 1.0)):
        if len(X) == 0:
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
        print(f"    -> best alpha={best_alpha} -> {best_prec:.4f}")

    report("val",  X_val,  df_val)
    report("test", X_test, df_test)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "boosters": boosters,
        "te_encoders": te_encoders,
        "global_freqs": global_freqs,
        "feature_cols": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "te_cols": TE_COLS,
        "emb_cols": EMB_COLS,
        "n_numbers": N_NUMBERS,
        "version": "v6-catboost",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
