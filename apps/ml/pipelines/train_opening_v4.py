"""
Model 2 v4 — Oracle Hierarchical Baseline

가설: LGBM이 te_* numeric을 못 잡음. 직접 hierarchical baseline 사용.

방법:
  1. orgName 평균 (n>=200)
  2. category × budgetRange 평균 (n>=200) — backup
  3. category 평균 — backup
  4. global 평균 — final fallback

각 행에 대해 가장 specific한 그룹의 평균 사용.

v3 (LGBM blend) 0.3261 → v4 oracle은 진단에서 0.344 도달 가능.
"""
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "opening_oracle_v4.pkl"

N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]
MIN_GROUP_SIZE = 50  # 그룹 크기 임계값 (50 미만은 fallback)


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


def build_lookup(df_train: pd.DataFrame) -> dict:
    """train 데이터로 hierarchical lookup 테이블 구성"""
    print("\nlookup 테이블 구성:")

    global_freqs = df_train[TARGET_COLS].mean().values
    print(f"  global: n={len(df_train):,}")

    # category 평균
    cat_counts = df_train["category"].value_counts()
    cat_means = df_train.groupby("category")[TARGET_COLS].mean()
    cat_lookup = {}
    for cat in cat_means.index:
        if cat_counts[cat] >= MIN_GROUP_SIZE:
            cat_lookup[cat] = cat_means.loc[cat].values
    print(f"  category: {len(cat_lookup)}개 (n>={MIN_GROUP_SIZE})")

    # category × budgetRange
    cb_counts = df_train.groupby(["category", "budgetRange"]).size()
    cb_means = df_train.groupby(["category", "budgetRange"])[TARGET_COLS].mean()
    cb_lookup = {}
    for (cat, br), n in cb_counts.items():
        if n >= MIN_GROUP_SIZE:
            cb_lookup[(cat, br)] = cb_means.loc[(cat, br)].values
    print(f"  cat×budget: {len(cb_lookup)}")

    # orgName × category
    oc_counts = df_train.groupby(["orgName", "category"]).size()
    oc_means = df_train.groupby(["orgName", "category"])[TARGET_COLS].mean()
    oc_lookup = {}
    for (org, cat), n in oc_counts.items():
        if n >= MIN_GROUP_SIZE:
            oc_lookup[(org, cat)] = oc_means.loc[(org, cat)].values
    print(f"  org×category: {len(oc_lookup)}")

    # orgName
    org_counts = df_train["orgName"].value_counts()
    org_means = df_train.groupby("orgName")[TARGET_COLS].mean()
    org_lookup = {}
    for org in org_means.index:
        if org_counts[org] >= MIN_GROUP_SIZE:
            org_lookup[org] = org_means.loc[org].values
    print(f"  orgName: {len(org_lookup)}")

    return {
        "global": global_freqs,
        "category": cat_lookup,
        "cat_budget": cb_lookup,
        "org_category": oc_lookup,
        "orgName": org_lookup,
    }


def predict_hierarchical(df: pd.DataFrame, lookup: dict) -> np.ndarray:
    """가장 specific한 그룹부터 backup"""
    n = len(df)
    preds = np.tile(lookup["global"], (n, 1))

    used = {"org_cat": 0, "org": 0, "cat_budget": 0, "category": 0, "global": 0}
    for i, row in enumerate(df.itertuples(index=False)):
        org = row.orgName
        cat = row.category
        br = row.budgetRange

        # 1순위: orgName × category
        key1 = (org, cat)
        if key1 in lookup["org_category"]:
            preds[i] = lookup["org_category"][key1]
            used["org_cat"] += 1
            continue
        # 2순위: orgName
        if org in lookup["orgName"]:
            preds[i] = lookup["orgName"][org]
            used["org"] += 1
            continue
        # 3순위: category × budgetRange
        key3 = (cat, br)
        if key3 in lookup["cat_budget"]:
            preds[i] = lookup["cat_budget"][key3]
            used["cat_budget"] += 1
            continue
        # 4순위: category
        if cat in lookup["category"]:
            preds[i] = lookup["category"][cat]
            used["category"] += 1
            continue
        # 5순위: global (이미 init)
        used["global"] += 1
    return preds, used


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
    df["category"] = df["category"].fillna("(NULL)")
    df["orgName"] = df["orgName"].fillna("(NULL)")
    df["budgetRange"] = df["budgetRange"].fillna("(NULL)")
    print(f"전체: {len(df):,}건")

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    lookup = build_lookup(df_train)

    print("\n=== 평가 ===")

    for name, df_split in [("train", df_train), ("val", df_val), ("test", df_test)]:
        if len(df_split) == 0:
            continue
        preds, used = predict_hierarchical(df_split, lookup)
        y_true = df_split[TARGET_COLS].values
        prec = top_k_precision(preds, y_true, k=4)
        n = len(df_split)
        print(f"\n  {name} (n={n:,}): Top-4 Precision = {prec:.4f}")
        print(f"    org×cat: {used['org_cat']:,} ({used['org_cat']/n*100:.1f}%)")
        print(f"    org:     {used['org']:,} ({used['org']/n*100:.1f}%)")
        print(f"    cat×br:  {used['cat_budget']:,} ({used['cat_budget']/n*100:.1f}%)")
        print(f"    cat:     {used['category']:,} ({used['category']/n*100:.1f}%)")
        print(f"    global:  {used['global']:,} ({used['global']/n*100:.1f}%)")

    # 모델 저장
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "lookup": lookup,
        "n_numbers": N_NUMBERS,
        "min_group_size": MIN_GROUP_SIZE,
        "version": "v4-oracle-hierarchical",
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
