"""
self_improve.py — 주간 SajungRateStat 자기 개선 파이프라인
BidOutcome에 기록된 실제 사정율 → SajungRateStat 가중 평균 업데이트

실행:
  python apps/ml/pipelines/self_improve.py

환경변수:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

pg_cron (Supabase SQL Editor):
  SELECT cron.schedule('self-improve-weekly', '0 2 * * 5',
    $$SELECT net.http_post(url := 'https://naktal.me/api/admin/self-improve',
      headers := '{"x-admin-key":"<ADMIN_SECRET_KEY>"}')$$);
"""

import os
import json
import math
from datetime import datetime, timedelta, timezone
import urllib.request
import urllib.error


def supabase_request(url: str, key: str, path: str, method: str = "GET", body=None, params: str = ""):
    full_url = f"{url}/rest/v1/{path}{'?' + params if params else ''}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        full_url,
        data=data,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def classify_budget(budget: int) -> str:
    if budget < 100_000_000:   return "1억미만"
    if budget < 300_000_000:   return "1억-3억"
    if budget < 1_000_000_000: return "3억-10억"
    if budget < 3_000_000_000: return "10억-30억"
    return "30억이상"


def update_sajung_stats_from_outcomes(days: int = 30) -> dict:
    """
    최근 N일간 actualSajungRate가 기록된 BidOutcome →
    해당 발주처/업종/예산/지역의 SajungRateStat avg를 가중 평균으로 갱신.
    신규 데이터 가중치 30%, 기존 70%.
    """
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # 최근 outcomes with actualSajungRate
    outcomes = supabase_request(
        url, key,
        "BidOutcome",
        params=f"select=annId,actualSajungRate&actualSajungRate=not.is.null&openedAt=gte.{since}&limit=500",
    )

    if not outcomes:
        print("[self_improve] 최근 outcomes 없음")
        return {"updated": 0}

    # annId → Announcement(orgName, category, budget, region)
    ann_ids = list({o["annId"] for o in outcomes})
    ann_ids_str = ",".join(f'"{a}"' for a in ann_ids)
    announcements_raw = supabase_request(
        url, key,
        "Announcement",
        params=f"select=id,orgName,category,budget,region&id=in.({ann_ids_str})&limit=1000",
    )
    ann_map = {a["id"]: a for a in (announcements_raw or [])}

    # 그룹별 실제 사정율 수집
    groups: dict[tuple, list[float]] = {}
    for o in outcomes:
        ann = ann_map.get(o["annId"])
        if not ann or not ann.get("budget"):
            continue
        key_tuple = (
            ann["orgName"],
            ann["category"],
            classify_budget(int(ann["budget"])),
            ann.get("region", ""),
        )
        groups.setdefault(key_tuple, []).append(float(o["actualSajungRate"]))

    updated = 0
    for (org_name, category, budget_range, region), actual_rates in groups.items():
        if not actual_rates:
            continue

        # SajungRateStat 조회
        stats = supabase_request(
            url, key,
            "SajungRateStat",
            params=(
                f"select=id,avg,sampleSize"
                f"&orgName=eq.{urllib.parse.quote(org_name)}"
                f"&category=eq.{urllib.parse.quote(category)}"
                f"&budgetRange=eq.{urllib.parse.quote(budget_range)}"
                f"&region=eq.{urllib.parse.quote(region)}"
                f"&limit=1"
            ),
        )
        if not stats:
            continue

        stat = stats[0]
        old_avg = float(stat["avg"])
        new_data_avg = sum(actual_rates) / len(actual_rates)

        # 가중 평균: 기존 70% + 신규 30%
        new_avg = round(old_avg * 0.7 + new_data_avg * 0.3, 4)
        new_sample_size = stat["sampleSize"] + len(actual_rates)

        supabase_request(
            url, key,
            f"SajungRateStat?id=eq.{stat['id']}",
            method="PATCH",
            body={
                "avg": new_avg,
                "sampleSize": new_sample_size,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"[self_improve] 업데이트: {org_name} | {category} | {budget_range} | {region} "
              f"avg {old_avg:.4f} → {new_avg:.4f} (n={len(actual_rates)}건 반영)")
        updated += 1

    return {
        "updated": updated,
        "outcomes_processed": len(outcomes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import urllib.parse  # noqa: F401 — needed inside function

    result = update_sajung_stats_from_outcomes(days=30)
    print(f"\n[self_improve] 완료: {json.dumps(result, ensure_ascii=False, indent=2)}")
