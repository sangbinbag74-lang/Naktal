"""
category별 분포 + oracle 분리 효과 진단

질문: "공사/용역/물품/외자 분야가 다양한데 통합 학습이 정확도를 떨어뜨리는가?"

검증:
  1. category별 행 수
  2. category별 번호 빈도 분포 (각 sel_N 평균)
  3. category별 빈도 분포 차이 측정 (L1 distance, 상위 4개 일치 여부)
  4. 카테고리 oracle vs 통합 oracle 비교
     - 통합: train 전체 → val 매칭 (v4 결과 0.3203)
     - 분리: 각 category별 train → 같은 category val 매칭

결과 해석:
  - 카테고리별 분포가 비슷하면 → 통합 학습 OK
  - 차이 크고 분리 oracle ↑ → 카테고리별 분리 학습 필요 (v6 후보)
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"

N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]
MIN_GROUP_SIZE = 50


def top_k_precision(pred_probs: np.ndarray, y_true: np.ndarray, k: int = 4) -> float:
    n = len(pred_probs)
    hits = 0; total = 0
    for i in range(n):
        top_k_pred = set(np.argsort(pred_probs[i])[::-1][:k].tolist())
        true_idx = set(np.where(y_true[i] == 1)[0].tolist())
        if len(true_idx) == 0:
            continue
        hits += len(top_k_pred & true_idx)
        total += k
    return hits / total if total > 0 else 0.0


def main():
    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={"category": "string", "orgName": "string", "split": "string"})
    df["category"] = df["category"].fillna("(NULL)")
    print(f"전체: {len(df):,}건\n")

    print("=" * 70)
    print("1. category 분포")
    print("=" * 70)
    cat_counts = df["category"].value_counts()
    for cat, cnt in cat_counts.items():
        print(f"  {cat:<30}: {cnt:>10,}건 ({cnt/len(df)*100:5.2f}%)")

    print("\n" + "=" * 70)
    print("2. category별 번호 평균 빈도 (상위 4번호)")
    print("=" * 70)
    print(f"  {'category':<30} {'top4 (idx, prob)':<60}")
    cat_freqs = {}
    for cat in cat_counts.index:
        sub = df[df["category"] == cat]
        if len(sub) < 1000:
            continue
        freqs = sub[TARGET_COLS].mean().values
        top4_idx = np.argsort(freqs)[::-1][:4]
        top4_str = ", ".join([f"sel_{i+1}={freqs[i]:.3f}" for i in top4_idx])
        cat_freqs[cat] = freqs
        print(f"  {cat[:30]:<30} {top4_str}")

    print("\n" + "=" * 70)
    print("3. category 빈도 분포 차이 (글로벌 vs category)")
    print("=" * 70)
    global_freqs = df[TARGET_COLS].mean().values
    print(f"  글로벌 top4: " + ", ".join([f"sel_{i+1}={global_freqs[i]:.3f}" for i in np.argsort(global_freqs)[::-1][:4]]))
    print()
    for cat, freqs in cat_freqs.items():
        l1 = np.sum(np.abs(freqs - global_freqs))
        global_top4 = set(np.argsort(global_freqs)[::-1][:4].tolist())
        cat_top4 = set(np.argsort(freqs)[::-1][:4].tolist())
        overlap = len(global_top4 & cat_top4)
        print(f"  {cat[:30]:<30} L1 dist={l1:.4f}  top4 일치={overlap}/4")

    print("\n" + "=" * 70)
    print("4. 통합 oracle vs 분리 oracle (val/test)")
    print("=" * 70)
    df_train = df[df["split"] == "train"]
    df_val   = df[df["split"] == "val"]
    df_test  = df[df["split"] == "test"]

    # 4-1. 통합 oracle (org×cat lookup, fallback hierarchy)
    print(f"\n[A] 통합 oracle (train 전체 → 모든 split)")
    train_global = df_train[TARGET_COLS].mean().values
    # category 평균
    cat_means_all = df_train.groupby("category")[TARGET_COLS].mean()
    cat_counts_all = df_train["category"].value_counts()
    cat_lookup_all = {}
    for cat in cat_means_all.index:
        if cat_counts_all[cat] >= MIN_GROUP_SIZE:
            cat_lookup_all[cat] = cat_means_all.loc[cat].values
    # org×category 평균
    oc_counts = df_train.groupby(["orgName", "category"]).size()
    oc_means = df_train.groupby(["orgName", "category"])[TARGET_COLS].mean()
    oc_lookup = {}
    for (org, cat), n in oc_counts.items():
        if n >= MIN_GROUP_SIZE:
            oc_lookup[(org, cat)] = oc_means.loc[(org, cat)].values

    def predict_unified(df_split):
        n = len(df_split)
        preds = np.tile(train_global, (n, 1))
        for i, row in enumerate(df_split.itertuples(index=False)):
            key = (row.orgName, row.category)
            if key in oc_lookup:
                preds[i] = oc_lookup[key]
            elif row.category in cat_lookup_all:
                preds[i] = cat_lookup_all[row.category]
        return preds

    for name, ds in [("val", df_val), ("test", df_test)]:
        if len(ds) == 0:
            continue
        preds = predict_unified(ds)
        prec = top_k_precision(preds, ds[TARGET_COLS].values, k=4)
        print(f"  통합 {name} (n={len(ds):,}): Top-4 = {prec:.4f}")

    # 4-2. 분리 oracle (category별 별도 oracle 후 합산)
    print(f"\n[B] 분리 oracle (category별 train → 같은 category split)")
    for cat in cat_counts.index:
        cat_train = df_train[df_train["category"] == cat]
        if len(cat_train) < 1000:
            continue
        cat_global = cat_train[TARGET_COLS].mean().values

        # category 내부 org 평균
        cat_oc_counts = cat_train["orgName"].value_counts()
        cat_oc_means  = cat_train.groupby("orgName")[TARGET_COLS].mean()
        cat_oc_lookup = {}
        for org in cat_oc_means.index:
            if cat_oc_counts[org] >= MIN_GROUP_SIZE:
                cat_oc_lookup[org] = cat_oc_means.loc[org].values

        for name, ds_full in [("val", df_val), ("test", df_test)]:
            ds = ds_full[ds_full["category"] == cat]
            if len(ds) < 100:
                continue
            n = len(ds)
            preds = np.tile(cat_global, (n, 1))
            for i, row in enumerate(ds.itertuples(index=False)):
                if row.orgName in cat_oc_lookup:
                    preds[i] = cat_oc_lookup[row.orgName]
            prec = top_k_precision(preds, ds[TARGET_COLS].values, k=4)
            print(f"  {cat[:20]:<20} {name} (n={n:>7,}): Top-4 = {prec:.4f}")

    print("\n" + "=" * 70)
    print("결론 가이드")
    print("=" * 70)
    print("  - L1 dist 큰 category 다수 + top4 일치 ≤2/4 → 분리 학습 유망")
    print("  - 분리 oracle - 통합 oracle ≥ 0.01 → v6 분리 모델 추진")
    print("  - 차이 미미하면 통합 모델 유지 + KoBERT (v5)에 집중")


if __name__ == "__main__":
    main()
