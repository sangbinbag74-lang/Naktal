"""복수예가 번호 통계 추천 모듈.

입력: category, budget_range, num_bidders_est
처리:
  1. 동일 조건 과거 공고 조회
  2. 번호(1~15)별 선택 빈도 집계
  3. 상위 30% 빈도 번호 회피 전략 적용
  4. 추천 조합 3세트 반환

⚠️  disclaimer 필드 항상 포함.
"""

from __future__ import annotations

import json
import os
import random
from typing import Any

import numpy as np
import pandas as pd
from supabase import create_client

DISCLAIMER = "통계적 참고 자료입니다. 결과를 보장하지 않습니다."

# 번호 범위 (나라장터 복수예가 번호 1~15)
ALL_NUMBERS = list(range(1, 16))
COMBO_SIZE = 2  # 복수예가 추첨 번호 선택 수 (공종별 다를 수 있음, 기본 2)


def _get_budget_range(budget: int) -> str:
    """예산을 구간 문자열로 변환."""
    if budget < 10_000_000:
        return "1천만미만"
    elif budget < 50_000_000:
        return "1천만~5천만"
    elif budget < 100_000_000:
        return "5천만~1억"
    elif budget < 500_000_000:
        return "1억~5억"
    elif budget < 1_000_000_000:
        return "5억~10억"
    else:
        return "10억이상"


def compute_preeprice_recommendation(
    raw_data: list[dict[str, Any]],
    category: str,
    budget: int,
    num_bidders_est: int,
) -> dict[str, Any]:
    """
    raw_data: list of {"selected_numbers": [1, 5, 12], ...} 형태 과거 공고 데이터
    반환값:
    {
        "combos": [
            {"numbers": [3, 11], "hit_rate": 12.4},
            ...
        ],
        "sample_size": 387,
        "disclaimer": "..."
    }
    """
    if not raw_data:
        return {
            "combos": _fallback_combos(),
            "sample_size": 0,
            "disclaimer": DISCLAIMER,
        }

    # 번호별 빈도 집계
    freq: dict[int, int] = {n: 0 for n in ALL_NUMBERS}
    total_draws = 0

    for record in raw_data:
        numbers = record.get("selected_numbers") or []
        if isinstance(numbers, str):
            try:
                numbers = json.loads(numbers)
            except Exception:
                continue
        for n in numbers:
            if isinstance(n, (int, float)) and 1 <= int(n) <= 15:
                freq[int(n)] += 1
                total_draws += 1

    if total_draws == 0:
        return {
            "combos": _fallback_combos(),
            "sample_size": len(raw_data),
            "disclaimer": DISCLAIMER,
        }

    # 정규화된 빈도
    rate = {n: (freq[n] / total_draws * 100) for n in ALL_NUMBERS}

    # 상위 30% 고빈도 번호 회피
    threshold = np.percentile(list(rate.values()), 70)
    low_freq_numbers = [n for n, r in rate.items() if r <= threshold]

    # 추천 조합 3세트 생성
    combos: list[dict[str, Any]] = []
    seen: set[tuple[int, ...]] = set()

    candidates = sorted(low_freq_numbers, key=lambda n: rate[n])

    for _ in range(50):  # 최대 50회 시도
        if len(combos) >= 3:
            break
        if len(candidates) >= COMBO_SIZE:
            # 낮은 빈도 번호 중 랜덤 선택 (가중치 반비례)
            weights = [1.0 / (rate[n] + 0.01) for n in candidates]
            chosen = random.choices(candidates, weights=weights, k=COMBO_SIZE)
        else:
            chosen = random.sample(ALL_NUMBERS, COMBO_SIZE)

        key = tuple(sorted(chosen))
        if key in seen:
            continue
        seen.add(key)

        # 이 조합의 역사적 적중률 추정
        combo_hit = sum(freq.get(n, 0) for n in key)
        hit_rate = round(combo_hit / total_draws * 100, 1) if total_draws else 0.0

        combos.append({"numbers": list(key), "hit_rate": hit_rate})

    # 적중률 내림차순 정렬
    combos.sort(key=lambda x: x["hit_rate"], reverse=True)

    # 3개 미만이면 나머지 채우기
    while len(combos) < 3:
        combo = sorted(random.sample(ALL_NUMBERS, COMBO_SIZE))
        key = tuple(combo)
        if key not in seen:
            seen.add(key)
            combos.append({"numbers": combo, "hit_rate": 0.0})

    return {
        "combos": combos[:3],
        "sample_size": len(raw_data),
        "disclaimer": DISCLAIMER,
    }


def _fallback_combos() -> list[dict[str, Any]]:
    """데이터 없을 때 랜덤 조합 반환 (항상 disclaimer와 함께)."""
    seen: set[tuple[int, ...]] = set()
    combos = []
    while len(combos) < 3:
        combo = tuple(sorted(random.sample(ALL_NUMBERS, COMBO_SIZE)))
        if combo not in seen:
            seen.add(combo)
            combos.append({"numbers": list(combo), "hit_rate": 0.0})
    return combos


def fetch_similar_announcements(
    supabase_url: str,
    supabase_key: str,
    category: str,
    budget: int,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Supabase에서 유사 공고의 낙찰 결과 조회."""
    client = create_client(supabase_url, supabase_key)
    budget_range = _get_budget_range(budget)

    # budget ±50% 범위 조회
    lo = int(budget * 0.5)
    hi = int(budget * 1.5)

    res = (
        client.table("BidResult")
        .select("raw_json,selected_numbers")
        .eq("category", category)
        .gte("final_price", lo)
        .lte("final_price", hi)
        .limit(limit)
        .execute()
    )
    return res.data or []
