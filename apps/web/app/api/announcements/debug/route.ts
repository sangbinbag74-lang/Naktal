import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const result: Record<string, unknown> = {};

  // 1. 환경변수 체크
  result.env = {
    G2B_API_KEY: process.env.G2B_API_KEY ? `set (${process.env.G2B_API_KEY.slice(0, 8)}...)` : "NOT SET ❌",
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set ✅" : "NOT SET ❌",
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set ✅" : "NOT SET ❌",
  };

  // 2. DB 연결 + Announcement 테이블 존재 여부
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("Announcement")
      .select("*", { count: "exact", head: true });

    if (error) {
      result.db = { ok: false, error: error.message, hint: error.hint ?? "" };
    } else {
      result.db = { ok: true, count };
    }
  } catch (e) {
    result.db = { ok: false, error: String(e) };
  }

  // 3. G2B API 직접 호출 테스트 (1건만)
  try {
    const key = process.env.G2B_API_KEY;
    if (!key) throw new Error("G2B_API_KEY 없음");

    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const from = new Date(today); from.setDate(from.getDate() - 3);
    const fromYmd = from.toISOString().slice(0, 10).replace(/-/g, "");

    const url = new URL("https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc");
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("numOfRows", "1");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("type", "json");
    url.searchParams.set("inqryDiv", "1");
    url.searchParams.set("inqryBgnDt", `${fromYmd}0000`);
    url.searchParams.set("inqryEndDt", `${ymd}2359`);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }

    if (!res!.ok) throw new Error(`HTTP ${res!.status}`);
    const data = await res!.json() as { response: { header: { resultCode: string; resultMsg: string }; body: { totalCount: number } } };
    result.g2b = {
      ok: true,
      resultCode: data.response?.header?.resultCode,
      resultMsg: data.response?.header?.resultMsg,
      totalCount: data.response?.body?.totalCount,
    };
  } catch (e) {
    result.g2b = { ok: false, error: String(e) };
  }

  // 4. 샘플 upsert 테스트 (실제 데이터 X, 더미)
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("Announcement").upsert([{
      id: crypto.randomUUID(),
      konepsId: "DEBUG-TEST-000",
      title: "디버그 테스트 공고",
      orgName: "테스트기관",
      budget: 100000000,
      deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
      category: "토목공사",
      region: "서울",
      rawJson: { test: "true" },
    }], { onConflict: "konepsId" });

    if (error) {
      result.upsertTest = { ok: false, error: error.message };
    } else {
      result.upsertTest = { ok: true };
      // 삽입 후 삭제
      await admin.from("Announcement").delete().eq("konepsId", "DEBUG-TEST-000");
    }
  } catch (e) {
    result.upsertTest = { ok: false, error: String(e) };
  }

  return NextResponse.json(result, { status: 200 });
}
