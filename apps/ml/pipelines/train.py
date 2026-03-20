"""Training entry point.

Usage:
    python pipelines/train.py

Requires env vars:
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

# Load env from apps/web/.env.local
_root = os.path.join(os.path.dirname(__file__), "..", "..", "web")
load_dotenv(os.path.join(_root, ".env.local"))

import pandas as pd
from supabase import create_client

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.bid_rate_model import BidRatePredictor


QUERY = """
SELECT
  br.bid_rate,
  a.budget,
  a.category,
  a.region,
  a.org_name,
  br.num_bidders,
  a.deadline,
  COUNT(*) OVER (PARTITION BY a.category) AS category_bid_count
FROM "BidResult" br
JOIN "Announcement" a ON br."annId" = a.id
WHERE br.bid_rate IS NOT NULL
"""


def main() -> None:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    client = create_client(url, key)

    print("[train] Supabase에서 학습 데이터 조회 중...")
    # Supabase SDK는 raw SQL 미지원이므로 개별 테이블 조회 후 조인
    ann_res = client.table("Announcement").select(
        "id,budget,category,region,org_name,deadline"
    ).execute()
    bid_res = client.table("BidResult").select(
        "annId,bid_rate,num_bidders"
    ).not_.is_("bid_rate", "null").execute()

    ann_df = pd.DataFrame(ann_res.data)
    bid_df = pd.DataFrame(bid_res.data)

    if ann_df.empty or bid_df.empty:
        print("[train] 데이터가 없습니다. 크롤러를 먼저 실행해 주세요.")
        sys.exit(1)

    df = bid_df.merge(ann_df, left_on="annId", right_on="id", how="inner")
    df = df.rename(columns={"bid_rate": "bid_rate"})
    df["bid_rate"] = pd.to_numeric(df["bid_rate"], errors="coerce")
    df = df.dropna(subset=["bid_rate"])

    total = len(df)
    print(f"[train] 학습 데이터 {total:,}건 로드 완료")

    if total < 3000:
        print(
            f"[train] ⚠️  학습 데이터 {total:,}건 (권장 최소 3,000건). "
            "예측 정확도가 낮을 수 있습니다."
        )

    predictor = BidRatePredictor()
    predictor.fit(df)
    predictor.save()

    print("[train] ✅ 모델 학습 및 저장 완료")


if __name__ == "__main__":
    main()
