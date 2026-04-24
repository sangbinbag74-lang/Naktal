"""
Raw 테이블 → 학습 CSV 로컬 merge (pandas)

입력: apps/ml/data/raw/
  - announcement.csv
  - bidresult.csv
  - sajungstat.csv
  - opening.csv

출력: apps/ml/data/
  - training_data_v2.csv (사정율 v2, Model 1)
  - opening_data.csv (복수예가, Model 2)
  (participants_data.csv는 이미 생성됨, 유지)

실행:
  cd apps/ml
  .venv\\Scripts\\activate
  python pipelines/merge_raw.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data"


def budget_range(budget):
    if budget < 100_000_000:   return "1억미만"
    if budget < 300_000_000:   return "1억-3억"
    if budget < 1_000_000_000: return "3억-10억"
    if budget < 3_000_000_000: return "10억-30억"
    return "30억이상"


def load_raw():
    print("=== Raw 테이블 로드 ===")
    ann = pd.read_csv(RAW_DIR / "announcement.csv", parse_dates=["deadline"])
    print(f"  Announcement: {len(ann):,} rows, {ann.memory_usage(deep=True).sum()/1e6:.0f} MB")
    br = pd.read_csv(RAW_DIR / "bidresult.csv")
    print(f"  BidResult   : {len(br):,}")
    sr = pd.read_csv(RAW_DIR / "sajungstat.csv")
    print(f"  SajungStat  : {len(sr):,}")
    op_path = RAW_DIR / "opening.csv"
    op = pd.read_csv(op_path) if op_path.exists() else None
    if op is not None:
        print(f"  Opening     : {len(op):,}")
    chg_path = RAW_DIR / "chg_count.csv"
    chg = pd.read_csv(chg_path) if chg_path.exists() else None
    if chg is not None:
        print(f"  ChgCount    : {len(chg):,}")
    pre_path = RAW_DIR / "prestdrd.csv"
    pre = pd.read_csv(pre_path) if pre_path.exists() else None
    if pre is not None:
        print(f"  PreStdrd    : {len(pre):,}")
    return ann, br, sr, op, chg, pre


def _expanding_stats(df, group_cols, col_name_prefix):
    """그룹별 deadline 오름차순 expanding mean/std/count (leakage 방지: .shift(1))"""
    g = df.groupby(group_cols, sort=False)["sajung_rate"]
    mean_s = g.expanding().mean().shift(1).reset_index(level=list(range(len(group_cols))), drop=True)
    std_s = g.expanding().std().shift(1).reset_index(level=list(range(len(group_cols))), drop=True)
    cnt_s = g.cumcount()  # 현재 행 이전까지 누적 카운트
    df[f"{col_name_prefix}_mean"] = mean_s
    df[f"{col_name_prefix}_std"] = std_s
    df[f"{col_name_prefix}_cnt"] = cnt_s
    return df


def build_sajung_csv(ann, br, sr, chg):
    print("\n=== Model 1 (사정율) CSV 생성 ===")

    # Inner join: Announcement + BidResult (konepsId = annId)
    df = ann.merge(br, left_on="konepsId", right_on="annId", how="inner")
    print(f"  JOIN BidResult: {len(df):,}")

    # 사정율 계산
    df["sajung_rate"] = (df["final_price"] / (df["bidRate"] / 100)) / df["budget"] * 100
    df = df[(df["sajung_rate"] >= 97) & (df["sajung_rate"] <= 103)].copy()
    print(f"  97~103% 필터: {len(df):,}")

    # budgetRange 계산
    df["budgetRange"] = df["budget"].apply(budget_range)

    # SajungStat LEFT JOIN
    df = df.merge(sr, on=["orgName", "category", "budgetRange", "region"], how="left")
    matched = df["avg"].notna().sum()
    print(f"  LEFT JOIN SajungRateStat: {len(df):,} (matched {matched:,})")

    g_avg = float(sr["avg"].mean())
    g_std = float(sr["stddev"].mean()) if "stddev" in sr.columns else 0.5
    g_p25 = float(sr["p25"].mean()) if "p25" in sr.columns else g_avg - 0.5
    g_p75 = float(sr["p75"].mean()) if "p75" in sr.columns else g_avg + 0.5
    df["avg"] = df["avg"].fillna(g_avg)
    df["stddev"] = df["stddev"].fillna(g_std)
    df["p25"] = df["p25"].fillna(g_p25)
    df["p75"] = df["p75"].fillna(g_p75)
    df["sampleSize"] = df["sampleSize"].fillna(0).astype(int)

    # chg_count LEFT JOIN
    if chg is not None and len(chg) > 0:
        df = df.merge(chg, left_on="konepsId", right_on="annId", how="left", suffixes=("", "_chg"))
        df["chg_count"] = df["chg_count"].fillna(0).astype(int)
        print(f"  LEFT JOIN ChgCount: matched {(df['chg_count'] > 0).sum():,}")
    else:
        df["chg_count"] = 0

    # 기본 파생
    df["month"] = df["deadline"].dt.month
    df["year"] = df["deadline"].dt.year
    df["season_q"] = ((df["month"] - 1) // 3) + 1
    df["weekday"] = df["deadline"].dt.weekday
    df["is_quarter_end"] = df["month"].isin([3, 6, 9, 12]).astype(int)
    df["is_year_end"] = df["month"].isin([11, 12]).astype(int)
    df["budget_log"] = np.log(df["budget"].clip(lower=1))
    df["bsisAmt_log"] = np.log(df["bsis_amt"].clip(lower=1))
    df["aValueTotal_log"] = np.where(df["avalue_total"] > 0, np.log(df["avalue_total"] + 1), 0)
    df["aValue_ratio"] = df["avalue_total"] / df["budget"]
    df["has_avalue"] = (df["avalue_total"] > 0).astype(int)
    df["bsis_to_budget"] = df["bsis_amt"] / df["budget"]
    df["bidder_volatility"] = df["stddev"] / df["avg"].clip(lower=0.01)
    df["is_sparse_org"] = (df["sampleSize"] < 30).astype(int)
    df["stat_avg"] = df["avg"]
    df["stat_stddev"] = df["stddev"]
    df["stat_p25"] = df["p25"]
    df["stat_p75"] = df["p75"]
    df["lwltRate"] = df["lwlt_rate"].fillna(87.745)
    df["rsrvtn_bgn"] = df["rsrvtn_bgn"].fillna(0)
    df["rsrvtn_end"] = df["rsrvtn_end"].fillna(0)
    df["has_prestdrd"] = 0

    # 핵심: Expanding mean 피처 (leakage 방지, deadline 오름차순 정렬)
    print(f"  Expanding mean 피처 계산 중...")
    df = df.sort_values("deadline", kind="mergesort").reset_index(drop=True)

    df = _expanding_stats(df, ["orgName"], "org_past")
    df = _expanding_stats(df, ["category"], "cat_past")
    df = _expanding_stats(df, ["region"], "reg_past")
    df = _expanding_stats(df, ["budgetRange"], "bud_past")
    df = _expanding_stats(df, ["subcat_main"], "sub_past")
    df = _expanding_stats(df, ["orgName", "category"], "orgcat_past")
    df = _expanding_stats(df, ["category", "region"], "catreg_past")
    df = _expanding_stats(df, ["orgName", "budgetRange"], "orgbud_past")

    # Expanding 결측 → 전역 평균/표준편차로 채움
    global_mean = df["sajung_rate"].mean()
    global_std = df["sajung_rate"].std()
    for prefix in ["org_past", "cat_past", "reg_past", "bud_past", "sub_past",
                   "orgcat_past", "catreg_past", "orgbud_past"]:
        df[f"{prefix}_mean"] = df[f"{prefix}_mean"].fillna(global_mean)
        df[f"{prefix}_std"] = df[f"{prefix}_std"].fillna(global_std)
        df[f"{prefix}_cnt"] = df[f"{prefix}_cnt"].fillna(0).astype(int)

    # Split — train ≤ 2024, val = 2025 상반기, test = 2025 하반기 이후
    is_train = df["year"] <= 2024
    is_val = (df["year"] == 2025) & (df["month"] <= 6)
    df["split"] = np.where(is_train, "train", np.where(is_val, "val", "test"))

    df["numBidders"] = df["numBidders"].clip(upper=500)

    out_cols = [
        "category", "orgName", "budgetRange", "region", "subcat_main",
        "month", "year", "weekday", "is_quarter_end", "is_year_end", "season_q",
        "budget_log", "numBidders",
        "stat_avg", "stat_stddev", "stat_p25", "stat_p75", "sampleSize",
        "bidder_volatility", "is_sparse_org",
        "aValueTotal_log", "aValue_ratio", "has_avalue",
        "bsisAmt_log", "bsis_to_budget",
        "lwltRate", "rsrvtn_bgn", "rsrvtn_end",
        "has_prestdrd", "chg_count",
        # expanding mean (24 피처)
        "org_past_mean", "org_past_std", "org_past_cnt",
        "cat_past_mean", "cat_past_std", "cat_past_cnt",
        "reg_past_mean", "reg_past_std", "reg_past_cnt",
        "bud_past_mean", "bud_past_std", "bud_past_cnt",
        "sub_past_mean", "sub_past_std", "sub_past_cnt",
        "orgcat_past_mean", "orgcat_past_std", "orgcat_past_cnt",
        "catreg_past_mean", "catreg_past_std", "catreg_past_cnt",
        "orgbud_past_mean", "orgbud_past_std", "orgbud_past_cnt",
        "sajung_rate", "split",
    ]
    out = df[out_cols]
    out_path = OUT_DIR / "training_data_v2.csv"
    out.to_csv(out_path, index=False)
    train = (out["split"] == "train").sum()
    val = (out["split"] == "val").sum()
    test = (out["split"] == "test").sum()
    print(f"  저장: {out_path} ({len(out):,} rows, {len(out_cols)-2} 피처, train {train:,} / val {val:,} / test {test:,})")


def build_opening_csv(ann, op):
    if op is None:
        print("\n[opening] 데이터 없음 — skip")
        return
    print("\n=== Model 2 (복수예가) CSV 생성 ===")

    # Parse selPrdprcIdx — PG array format: {1,3,7,12}
    def parse_idx(s):
        if pd.isna(s): return []
        t = str(s).strip("{}")
        return [int(x) for x in t.split(",") if x.strip().isdigit()]

    op["sel_list"] = op["selPrdprcIdx"].apply(parse_idx)

    # Inner join
    df = ann.merge(op, left_on="konepsId", right_on="annId", how="inner")
    print(f"  JOIN: {len(df):,}")

    # 15개 binary label
    for i in range(1, 16):
        df[f"sel_{i}"] = df["sel_list"].apply(lambda lst, i=i: 1 if i in lst else 0)

    # 피처
    df["month"] = df["deadline"].dt.month
    df["year"] = df["deadline"].dt.year
    df["season_q"] = ((df["month"] - 1) // 3) + 1
    df["budget_log"] = np.log(df["budget"].clip(lower=1))
    df["bsisAmt_log"] = np.log(df["bsis_amt"].clip(lower=1))
    df["aValueTotal_log"] = np.where(df["avalue_total"] > 0, np.log(df["avalue_total"] + 1), 0)
    df["has_avalue"] = (df["avalue_total"] > 0).astype(int)
    df["lwltRate"] = df["lwlt_rate"].fillna(87.745)
    df["budgetRange"] = df["budget"].apply(budget_range)
    df["numBidders"] = df["bid_count"].fillna(0)

    df["split"] = np.where(df["year"] <= 2023, "train",
                  np.where(df["year"] == 2024, "val", "test"))

    sel_cols = [f"sel_{i}" for i in range(1, 16)]
    out_cols = [
        "category", "orgName", "budgetRange", "region",
        "budget_log", "bsisAmt_log", "lwltRate",
        "month", "season_q", "year",
        "numBidders", "aValueTotal_log", "has_avalue",
        "subcat_main",
        *sel_cols, "split",
    ]
    out = df[out_cols]
    out_path = OUT_DIR / "opening_data.csv"
    out.to_csv(out_path, index=False)
    train = (out["split"] == "train").sum()
    val = (out["split"] == "val").sum()
    test = (out["split"] == "test").sum()
    print(f"  저장: {out_path} ({len(out):,} rows, train {train:,} / val {val:,} / test {test:,})")


def main():
    if not RAW_DIR.exists():
        print(f"ERROR: {RAW_DIR} 없음. 먼저 export-raw-tables.ts 실행.")
        sys.exit(1)

    import time
    t0 = time.time()
    ann, br, sr, op, chg, pre = load_raw()
    build_sajung_csv(ann, br, sr, chg)
    build_opening_csv(ann, op)
    print(f"\n=== 전체 완료: {(time.time()-t0)/60:.1f}분 ===")


if __name__ == "__main__":
    main()
