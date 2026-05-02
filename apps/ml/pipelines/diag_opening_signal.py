"""
Model 2 본질 한도 진단 — 학습 가능 신호가 데이터에 있는가?

검증:
  1. 번호별 전체 빈도 (uniform 4/15=0.267 대비 차이)
  2. 발주처별 번호 분포 카이제곱 검정 (uniform 가설)
  3. 카테고리별 번호 분포 차이
  4. 같은 발주처 차수 일관성 (코릴)
  5. 같은 (orgName, category) 그룹 차수 일관성

결론:
  - 모든 검정에서 uniform 가설 기각 못 하면 → 본질 random
  - 일부 차이 발견 시 → 학습 가능 신호 존재 (정확한 모델 못 잡음)
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "opening_data.csv"

N_NUMBERS = 15
TARGET_COLS = [f"sel_{i+1}" for i in range(N_NUMBERS)]
EXPECTED_RATIO = 4.0 / 15.0  # 0.2667


def main():
    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string", "split": "string",
    })
    df_train = df[df["split"] == "train"].copy()
    print(f"train: {len(df_train):,}건\n")

    print("=" * 60)
    print("1. 번호별 전체 빈도 (uniform 0.2667)")
    print("=" * 60)
    freqs = df_train[TARGET_COLS].mean()
    for i, f in enumerate(freqs):
        diff = (f - EXPECTED_RATIO) * 100
        print(f"  sel_{i+1:>2}: {f:.4f} (편차 {diff:+.2f}%p)")

    n = len(df_train)
    observed = (df_train[TARGET_COLS].sum() * 1).values.astype(float)
    expected = np.full(15, observed.sum() / 15.0)  # 합계 일치 보장
    chi2, p = stats.chisquare(observed, expected)
    print(f"\n  카이제곱: chi2={chi2:.2f}  p={p:.6f}")
    if p < 0.05:
        print(f"  -> uniform 가설 기각 OK (번호 빈도 차이 통계적 유의)")
    else:
        print(f"  -> uniform 가설 기각 못함 (random)")

    print("\n" + "=" * 60)
    print("2. 발주처별 번호 분포 차이 (top 10 발주처)")
    print("=" * 60)
    top_orgs = df_train["orgName"].value_counts().head(10).index
    differences = []
    for org in top_orgs:
        sub = df_train[df_train["orgName"] == org]
        if len(sub) < 100:
            continue
        org_freqs = sub[TARGET_COLS].mean().values
        # 전체 평균과의 거리
        dist = np.sum(np.abs(org_freqs - EXPECTED_RATIO))
        differences.append((org[:30], len(sub), dist))

    print(f"  {'orgName':<32} {'count':>8} {'L1 dist':>10}")
    for org, cnt, dist in differences:
        print(f"  {org:<32} {cnt:>8,} {dist:>10.4f}")

    print("\n" + "=" * 60)
    print("3. 카테고리별 번호 분포 차이")
    print("=" * 60)
    top_cats = df_train["category"].value_counts().head(10).index
    print(f"  {'category':<32} {'count':>8} {'L1 dist':>10}")
    for cat in top_cats:
        sub = df_train[df_train["category"] == cat]
        if len(sub) < 100:
            continue
        cat_freqs = sub[TARGET_COLS].mean().values
        dist = np.sum(np.abs(cat_freqs - EXPECTED_RATIO))
        print(f"  {str(cat)[:30]:<32} {len(sub):>8,} {dist:>10.4f}")

    print("\n" + "=" * 60)
    print("4. 발주처별 카이제곱 (각 발주처 독립 검정)")
    print("=" * 60)
    p_values = []
    for org in df_train["orgName"].value_counts().head(50).index:
        sub = df_train[df_train["orgName"] == org]
        if len(sub) < 200:
            continue
        observed_org = sub[TARGET_COLS].sum().values.astype(float)
        # 비교 = 글로벌 빈도 (uniform 아님)
        global_freqs = df_train[TARGET_COLS].mean().values
        expected_org = global_freqs * observed_org.sum() / global_freqs.sum()
        try:
            chi2_o, p_o = stats.chisquare(observed_org, expected_org)
            p_values.append(p_o)
        except Exception:
            continue
    if p_values:
        p_arr = np.array(p_values)
        sig_count = (p_arr < 0.05).sum()
        print(f"  검정한 발주처 수: {len(p_arr)}")
        print(f"  p<0.05 (uniform 거부): {sig_count} ({sig_count/len(p_arr)*100:.1f}%)")
        print(f"  median p: {np.median(p_arr):.4f}")
        if sig_count / len(p_arr) > 0.5:
            print(f"  -> 다수 발주처가 uniform 거부 OK 학습 가능 신호 존재")
        else:
            print(f"  -> 대부분 발주처가 uniform과 차이 없음 (random에 가까움)")

    print("\n" + "=" * 60)
    print("5. 본질 한도 추정")
    print("=" * 60)
    # 각 행이 "발주처 평균" 정확히 알면 도달 가능한 Top-4 Precision 시뮬
    org_means = df_train.groupby("orgName")[TARGET_COLS].mean()
    df_pred = df_train["orgName"].map(lambda x: org_means.loc[x] if x in org_means.index else None)
    # 발주처 알면 발주처 빈도 상위 4 vs 실제
    sample = df_train.sample(min(100000, len(df_train)), random_state=42)
    org_means_dict = {row.name: row.values for _, row in org_means.iterrows()}
    hits = 0
    total = 0
    for _, row in sample.iterrows():
        org = row["orgName"]
        if org not in org_means_dict:
            continue
        pred_freqs = org_means_dict[org]
        top4 = set(np.argsort(pred_freqs)[::-1][:4].tolist())
        true_idx = set(np.where(row[TARGET_COLS].values == 1)[0].tolist())
        if len(true_idx) == 0:
            continue
        hits += len(top4 & true_idx)
        total += 4
    if total > 0:
        org_oracle_prec = hits / total
        print(f"  발주처 평균만 사용 시 Top-4 Precision (oracle): {org_oracle_prec:.4f}")
        print(f"  현재 Model 2 v1 Top-4 Precision: 0.3260")
        print(f"  -> 발주처 정보가 도달 가능한 한도 추정")


if __name__ == "__main__":
    main()
