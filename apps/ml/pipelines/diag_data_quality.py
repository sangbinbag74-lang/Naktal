"""
Model 2 데이터 품질 + 시간 안정성 진단

핵심 질문:
  1. 연도별 sel_N 빈도 분포가 안정한가? (concept drift 정도)
  2. 각 연도 oracle in-sample (year freq -> same year top-4)
  3. train freq -> val/test 적용 시 천장은? (시간 invariant 가정 한계)
  4. 발주처별 sample size 분포 (smoothing 적정성)
  5. (orgName, category) 그룹 oracle in-sample

목적:
  - 0.326 천장의 원인 분리:
    * 시간 drift 인가?
    * 본질 random 인가?
    * label noise 인가?
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"

N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]


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
    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string", "split": "string",
    })
    df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0).astype(int)
    print(f"전체: {len(df):,}건\n")

    print("=" * 70)
    print("1. 연도별 sel_N 빈도 (시간 drift)")
    print("=" * 70)
    years = sorted(df["year"].unique())
    print(f"  연도 범위: {min(years)}-{max(years)}")
    yearly_freqs = {}
    print(f"  {'year':<6} {'count':>8}  {'top4 idx':<20} {'top4 prob sum':>14}")
    for y in years:
        sub = df[df["year"] == y]
        if len(sub) < 1000:
            continue
        f = sub[TARGET_COLS].mean().values
        top4 = np.argsort(f)[::-1][:4]
        top4_sum = f[top4].sum()
        yearly_freqs[y] = f
        top4_str = ",".join([f"sel_{i+1}" for i in top4])
        print(f"  {y:<6} {len(sub):>8,}  {top4_str:<20} {top4_sum:>14.4f}")

    print("\n" + "=" * 70)
    print("2. 각 연도 oracle in-sample Top-4 (해당 연도 평균만 알면)")
    print("=" * 70)
    print(f"  {'year':<6} {'count':>8}  {'oracle Top-4':>14}")
    for y in years:
        sub = df[df["year"] == y]
        if len(sub) < 1000:
            continue
        f = sub[TARGET_COLS].mean().values
        n = len(sub)
        preds = np.tile(f, (n, 1))
        prec = top_k_precision(preds, sub[TARGET_COLS].values, k=4)
        print(f"  {y:<6} {n:>8,}  {prec:>14.4f}")

    print("\n" + "=" * 70)
    print("3. train freq -> val/test (시간 invariant 가정)")
    print("=" * 70)
    df_train = df[df["split"] == "train"]
    df_val   = df[df["split"] == "val"]
    df_test  = df[df["split"] == "test"]
    train_freq = df_train[TARGET_COLS].mean().values
    print(f"  train top4: " + ",".join([f"sel_{i+1}" for i in np.argsort(train_freq)[::-1][:4]]))
    print(f"  train top4 sum: {train_freq[np.argsort(train_freq)[::-1][:4]].sum():.4f}")
    for name, ds in [("train(self)", df_train), ("val", df_val), ("test", df_test)]:
        if len(ds) == 0:
            continue
        n = len(ds)
        preds = np.tile(train_freq, (n, 1))
        prec = top_k_precision(preds, ds[TARGET_COLS].values, k=4)
        print(f"  {name:<12} (n={n:>8,}): {prec:.4f}")

    print("\n  -- val/test 자체 freq oracle (시간내 정보) --")
    for name, ds in [("val", df_val), ("test", df_test)]:
        if len(ds) == 0:
            continue
        own_f = ds[TARGET_COLS].mean().values
        n = len(ds)
        preds = np.tile(own_f, (n, 1))
        prec = top_k_precision(preds, ds[TARGET_COLS].values, k=4)
        print(f"  {name} self-freq oracle (n={n:,}): {prec:.4f}")

    print("\n" + "=" * 70)
    print("4. 연도별 freq L1 distance (vs train 글로벌)")
    print("=" * 70)
    print(f"  {'year':<6} {'L1 dist vs train':>18}  {'top4 일치':>10}")
    train_top4 = set(np.argsort(train_freq)[::-1][:4].tolist())
    for y, f in yearly_freqs.items():
        l1 = float(np.sum(np.abs(f - train_freq)))
        ytop4 = set(np.argsort(f)[::-1][:4].tolist())
        overlap = len(train_top4 & ytop4)
        print(f"  {y:<6} {l1:>18.4f}  {overlap}/4")

    print("\n" + "=" * 70)
    print("5. (orgName, category) 그룹 oracle in-sample (val/test)")
    print("=" * 70)
    MIN_GROUP = 30
    for name, ds in [("val", df_val), ("test", df_test)]:
        if len(ds) == 0:
            continue
        # 같은 (org, cat) 그룹 내 freq -> 그룹 데이터에 적용 (cheating, oracle 한도)
        gp = ds.groupby(["orgName", "category"])
        n_total = 0
        hits = 0
        denom = 0
        skipped = 0
        for (_, _), grp in gp:
            if len(grp) < MIN_GROUP:
                skipped += len(grp)
                continue
            f = grp[TARGET_COLS].mean().values
            top4 = set(np.argsort(f)[::-1][:4].tolist())
            for _, row in grp.iterrows():
                true_idx = set(np.where(row[TARGET_COLS].values == 1)[0].tolist())
                if not true_idx:
                    continue
                hits += len(top4 & true_idx)
                denom += 4
                n_total += 1
        if denom > 0:
            prec_oracle = hits / denom
            print(f"  {name} (org,cat) oracle in-sample (커버 n={n_total:,}, 스킵={skipped:,}): {prec_oracle:.4f}")

    print("\n" + "=" * 70)
    print("6. 발주처 sample size 분포")
    print("=" * 70)
    org_counts = df_train["orgName"].value_counts()
    print(f"  발주처 unique: {len(org_counts):,}")
    print(f"  count >= 30: {(org_counts >= 30).sum():,}  ({(org_counts >= 30).sum()/len(org_counts)*100:.1f}%)")
    print(f"  count >= 100: {(org_counts >= 100).sum():,}")
    print(f"  count >= 1000: {(org_counts >= 1000).sum():,}")
    print(f"  median: {int(org_counts.median())}")
    print(f"  p95: {int(org_counts.quantile(0.95))}")

    print("\n" + "=" * 70)
    print("7. label sanity - 4개 정확히 선택 비율")
    print("=" * 70)
    sums = df[TARGET_COLS].sum(axis=1)
    print(f"  4개 정확: {(sums == 4).sum():,} ({(sums==4).sum()/len(df)*100:.2f}%)")
    print(f"  != 4   : {(sums != 4).sum():,}")
    print(f"  분포: min={int(sums.min())} max={int(sums.max())} mean={sums.mean():.3f}")


if __name__ == "__main__":
    main()
